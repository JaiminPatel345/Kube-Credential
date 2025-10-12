import type { ConnectionOptions as TlsConnectionOptions } from 'tls';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PORT = 3001;
const DEFAULT_DATABASE_URL = 'postgres://kube:kube@localhost:5432/issuance_service';
const DEFAULT_VERIFICATION_SERVICE_URL = 'http://localhost:3002';
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_ALLOWED_ORIGINS = [DEFAULT_FRONTEND_URL];

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

const resolveDatabaseUrl = (value: string | undefined): string => {
  const trimmed = value?.trim();

  if (trimmed) {
    return trimmed;
  }

  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    throw new Error('DATABASE_URL environment variable is required in production');
  }

  return DEFAULT_DATABASE_URL;
};

const parseDatabaseSsl = (value: string | undefined): boolean | TlsConnectionOptions => {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  if (['require', 'strict', 'verify-full'].includes(normalized)) {
    return { rejectUnauthorized: true };
  }

  if (['allow', 'prefer', 'no-verify', 'verify-ca'].includes(normalized)) {
    return { rejectUnauthorized: false };
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return { rejectUnauthorized: false };
  }

  return false;
};

const workerId = process.env.HOSTNAME?.trim() || 'unknown';

const parseFrontendUrl = (value: string | undefined): string => {
  const raw = value?.trim();

  if (!raw) {
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      throw new Error('FRONTEND_URL environment variable is required in production');
    }
    return DEFAULT_FRONTEND_URL;
  }

  try {
    return new URL(raw).origin;
  } catch (_error) {
    throw new Error(`Invalid FRONTEND_URL: ${raw}. Must be a valid URL.`);
  }
};

const parseCorsOrigins = (value: string | undefined, frontendUrl: string): string[] => {
  const raw = value?.trim();

  if (!raw) {
    return [frontendUrl];
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    return [frontendUrl];
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
    return [frontendUrl];
  }

  return Array.from(new Set(validated));
};

const verificationServiceUrl = (() => {
  const raw = process.env.VERIFICATION_SERVICE_URL?.trim();

  if (!raw) {
    return DEFAULT_VERIFICATION_SERVICE_URL;
  }

  try {
    return new URL(raw).toString();
  } catch (_error) {
    return DEFAULT_VERIFICATION_SERVICE_URL;
  }
})();

const syncSecret = process.env.SYNC_SECRET?.trim() || null;
const frontendUrl = parseFrontendUrl(process.env.FRONTEND_URL);
const corsAllowedOrigins = parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS, frontendUrl);

export const serviceConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parsePort(process.env.PORT),
  databaseUrl: resolveDatabaseUrl(process.env.DATABASE_URL),
  databaseSsl: parseDatabaseSsl(process.env.DATABASE_SSL),
  workerId,
  verificationServiceUrl,
  syncSecret,
  corsAllowedOrigins
};

export const getWorkerLabel = (): string => {
  const { workerId: id } = serviceConfig;
  return id.startsWith('worker-') ? id : `worker-${id}`;
};
