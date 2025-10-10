import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const DEFAULT_PORT = 3001;
const DEFAULT_DB_RELATIVE = 'data/credentials.db';

const parsePort = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PORT;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_PORT;
  }
  return parsed;
};

const resolveDatabasePath = (value: string | undefined): string => {
  const trimmed = value?.trim();

  if (!trimmed) {
    const defaultPath = path.resolve(process.cwd(), DEFAULT_DB_RELATIVE);
    fs.mkdirSync(path.dirname(defaultPath), { recursive: true });
    return defaultPath;
  }

  if (trimmed === ':memory:' || trimmed.startsWith('file:')) {
    return trimmed;
  }

  const resolvedPath = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  return resolvedPath;
};

const workerId = process.env.HOSTNAME?.trim() || 'unknown';

export const serviceConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT),
  databasePath: resolveDatabasePath(process.env.DATABASE_PATH),
  workerId
};

export const getWorkerLabel = (): string => {
  const { workerId: id } = serviceConfig;
  return id.startsWith('worker-') ? id : `worker-${id}`;
};
