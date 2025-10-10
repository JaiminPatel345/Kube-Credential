import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const DEFAULT_PORT = 3002;
const DEFAULT_DB_RELATIVE = 'data/verification.db';
const DEFAULT_ISSUANCE_SERVICE_URL = 'http://localhost:3001';
const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173'];

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
const parseCorsOrigins = (value: string | undefined): string[] => {
  const raw = value?.trim();

  if (!raw) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  if (origins.includes('*')) {
    return ['*'];
  }

  const validated = origins
    .map((origin) => {
      try {
        return new URL(origin).origin;
      } catch (_error) {
        return null;
      }
    })
    .filter((origin): origin is string => origin !== null);

  if (validated.length === 0) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return Array.from(new Set(validated));
};
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

const corsAllowedOrigins = parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS);

export const serviceConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT),
  databasePath: resolveDatabasePath(process.env.DATABASE_PATH),
  workerId,
  syncSecret,
  issuanceServiceUrl,
  corsAllowedOrigins
};

export const getWorkerLabel = (): string => {
  const { workerId: id } = serviceConfig;
  return id.startsWith('worker-') ? id : `worker-${id}`;
};
