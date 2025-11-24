import cluster from 'cluster';
import os from 'os';

/**
 * Get the number of worker processes to spawn
 * Defaults to 1 if not specified or invalid
 */
export const getWorkerCount = (): number => {
  const workerCountEnv = process.env.WORKER_COUNT?.trim();
  
  if (!workerCountEnv) {
    return 1;
  }

  const parsed = Number.parseInt(workerCountEnv, 10);
  
  if (Number.isNaN(parsed) || parsed < 1) {
    console.warn(`Invalid WORKER_COUNT: ${workerCountEnv}. Defaulting to 1 worker.`);
    return 1;
  }

  const cpuCount = os.cpus().length;
  if (parsed > cpuCount) {
    console.warn(
      `WORKER_COUNT (${parsed}) exceeds CPU count (${cpuCount}). ` +
      `This may lead to performance degradation.`
    );
  }

  return parsed;
};

/**
 * Get the worker ID for the current process
 * Returns 'master' for the master process, or 'worker-N' for worker processes
 */
export const getWorkerId = (): string => {
  if (cluster.isPrimary) {
    return 'master';
  }
  
  const workerId = cluster.worker?.id;
  return workerId ? `worker-${workerId}` : 'unknown';
};

/**
 * Setup master process to spawn workers
 */
export const setupMaster = (serviceName: string, onWorkerReady?: () => void): void => {
  const workerCount = getWorkerCount();

  console.info(
    `[Master] ${serviceName} starting in cluster mode with ${workerCount} worker(s)`
  );

  // Track ready workers
  let readyWorkers = 0;
  const expectedWorkers = workerCount;

  // Fork workers
  for (let i = 0; i < workerCount; i++) {
    const worker = cluster.fork();
    
    worker.on('message', (msg) => {
      if (msg === 'ready') {
        readyWorkers++;
        console.info(
          `[Master] Worker ${worker.id} (worker-${worker.id}) is ready ` +
          `[${readyWorkers}/${expectedWorkers}]`
        );
        
        if (readyWorkers === expectedWorkers && onWorkerReady) {
          onWorkerReady();
        }
      }
    });
  }

  // Handle worker exit and respawn
  cluster.on('exit', (worker, code, signal) => {
    const exitReason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(
      `[Master] Worker ${worker.id} (worker-${worker.id}) died (${exitReason}). Restarting...`
    );
    
    const newWorker = cluster.fork();
    
    newWorker.on('message', (msg) => {
      if (msg === 'ready') {
        console.info(`[Master] Replacement worker ${newWorker.id} (worker-${newWorker.id}) is ready`);
      }
    });
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.info('[Master] Shutting down cluster...');
    
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.kill('SIGTERM');
      }
    }

    setTimeout(() => {
      console.info('[Master] Force shutdown');
      process.exit(0);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

/**
 * Notify master that worker is ready
 */
export const notifyReady = (): void => {
  if (cluster.isWorker && process.send) {
    process.send('ready');
  }
};
