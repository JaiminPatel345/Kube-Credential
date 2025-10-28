import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import router from './routes';
import { AppError, isAppError } from './utils/errors';
import { getWorkerLabel, serviceConfig } from './config';
import { initializeDatabase } from './utils/database';
import { performCatchUpSync } from './utils/sync';

const FIELD_LABELS: Record<string, string> = {
  id: 'Id',
  name: 'Name',
  credentialType: 'Credential Type',
  issuedBy: 'Issued By',
  issuedAt: 'Issued At',
  hash: 'Hash',
  details: 'Details'
};

export const createApp = () => {
  const app = express();

  const origin = serviceConfig.corsAllowedOrigins.includes('*')
    ? true
    : serviceConfig.corsAllowedOrigins;

  app.use(
    cors({
      origin,
      credentials: true,
      optionsSuccessStatus: 204
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'ok',
      worker: getWorkerLabel()
    });
  });

  app.use(router);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: 'Not Found' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const formattedIssues = err.issues.map((issue) => ({
        path: issue.path,
        message: issue.message
      }));

      const missingFields = new Set<string>();
      const otherMessages = new Set<string>();

      formattedIssues.forEach(({ path, message }) => {
        const rootKey = path[0] ? String(path[0]) : undefined;
        const label = rootKey && FIELD_LABELS[rootKey] ? FIELD_LABELS[rootKey] : rootKey;

        if (/required/i.test(message) || /must include at least one entry/i.test(message)) {
          missingFields.add(label ?? 'Field');
        } else {
          otherMessages.add(message);
        }
      });

      let message: string;

      if (missingFields.size > 0) {
        const fieldList = Array.from(missingFields);
        message =
          fieldList.length === 1
            ? `${fieldList[0]} is required`
            : `Missing required fields: ${fieldList.join(', ')}`;

        if (otherMessages.size > 0) {
          message = `${message}; ${Array.from(otherMessages).join('; ')}`;
        }
      } else if (otherMessages.size > 0) {
        message = Array.from(otherMessages).join('; ');
      } else {
        message = 'Invalid request payload';
      }

      return res.status(400).json({
        success: false,
        message,
        errors: formattedIssues
      });
    }

    if (isAppError(err)) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
        details: err.details ?? undefined
      });
    }

    // eslint-disable-next-line no-console
    console.error('Unhandled error occurred', err);

    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  });

  return app;
};

const app = createApp();

if (process.env.NODE_ENV !== 'test') {
  initializeDatabase()
    .then(async () => {
      try {
        const inserted = await performCatchUpSync();
        if (inserted > 0) {
          // eslint-disable-next-line no-console
          console.info(`Catch-up sync imported ${inserted} credential(s)`);
        }
      } catch (error) {
        if (error instanceof AppError) {
          // eslint-disable-next-line no-console
          console.error('Catch-up sync failed', { message: error.message, status: error.statusCode });
        } else {
          // eslint-disable-next-line no-console
          console.error('Catch-up sync failed', error);
        }
      }

      const { port } = serviceConfig;
      app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.info(`Verification service listening on port ${port}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize database', error);
      process.exit(1);
    });
}

export default app;
