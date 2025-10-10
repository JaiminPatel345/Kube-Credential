import express, { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import issueRoutes from './routes/issueRoutes';
import { AppError, isAppError } from './utils/errors';
import { getWorkerLabel, serviceConfig } from './config';
import { initializeDatabase } from './utils/database';

export const createApp = () => {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'ok',
      worker: getWorkerLabel()
    });
  });

  app.use('/api', issueRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: 'Not Found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request payload',
        errors: err.issues
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
    .then(() => {
      const { port } = serviceConfig;
      app.listen(port, () => {
        // eslint-disable-next-line no-console
        console.info(`Issuance service listening on port ${port}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize database', error);
      process.exit(1);
    });
}

export default app;
