import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import cluster from 'cluster';
import issueRoutes from './routes/issueRoutes';
import internalRoutes from './routes/internalRoutes';
import { AppError, isAppError } from './utils/errors';
import { getWorkerLabel, serviceConfig } from './config';
import { initializeDatabase } from './utils/database';
import { setupMaster, notifyReady, getWorkerCount } from './cluster';

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

  app.use('/api', issueRoutes);
  app.use('/internal', internalRoutes);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, message: 'Not Found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      // Check if there's a details-related error and make the message more specific
      const detailsError = err.issues.find(issue => 
        issue.path.includes('details') && issue.code === 'custom'
      );
      
      const message = detailsError 
        ? detailsError.message 
        : 'Invalid request payload';
      
      return res.status(400).json({
        success: false,
        message,
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

const startWorker = async () => {
  try {
    await initializeDatabase();
    
    const app = createApp();
    const { port } = serviceConfig;
    const workerId = getWorkerLabel();

    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.info(`[${workerId}] Issuance service listening on port ${port}`);
      notifyReady();
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start worker', error);
    process.exit(1);
  }
};

// Main execution logic
if (process.env.NODE_ENV !== 'test') {
  const workerCount = getWorkerCount();
  
  if (workerCount > 1) {
    // Multi-worker cluster mode
    if (cluster.isPrimary || cluster.isMaster) {
      setupMaster('Issuance Service');
    } else {
      startWorker();
    }
  } else {
    // Single worker mode (no clustering)
    startWorker();
  }
}

const app = createApp();
export default app;
