import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const DEFAULT_PORT = 3002;
const DEFAULT_DB_RELATIVE = 'data/verification.db';
const DEFAULT_ISSUANCE_SERVICE_URL = 'http://localhost:3001';

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

const workerId = process.env.HOSTNAME?.trim() || 'verification-service';
const syncSecret = process.env.SYNC_SECRET?.trim() || null;
const issuanceServiceUrl = (() => {
  const raw = process.env.ISSUANCE_SERVICE_URL?.trim();

  if (!raw) {
    return DEFAULT_ISSUANCE_SERVICE_URL;
  }

  try {
    return new URL(raw).toString();
  } catch (_error) {
    return DEFAULT_ISSUANCE_SERVICE_URL;
  }
})();

export const serviceConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT),
  databasePath: resolveDatabasePath(process.env.DATABASE_PATH),
  workerId,
  syncSecret,
  issuanceServiceUrl
};

export const getWorkerLabel = (): string => {
  const { workerId: id } = serviceConfig;
  return id.startsWith('worker-') ? id : `worker-${id}`;
};
