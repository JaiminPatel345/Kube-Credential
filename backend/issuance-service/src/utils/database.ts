import { Pool, type PoolConfig, type PoolClient } from 'pg';
import { newDb, type IMemoryDb } from 'pg-mem';
import { serviceConfig } from '../config';

let pool: Pool | null = null;
let memoryDb: IMemoryDb | null = null;

const createPool = (): Pool => {
  const { databaseUrl, databaseSsl } = serviceConfig;

  if (databaseUrl.startsWith('memory://')) {
    memoryDb = newDb({ autoCreateForeignKeyIndices: true });
    memoryDb.public.none("SET TIME ZONE 'UTC'");
    const adapter = memoryDb.adapters.createPg();
    return new adapter.Pool();
  }

  const config: PoolConfig = {
    connectionString: databaseUrl
  };

  if (databaseSsl) {
    config.ssl = databaseSsl;
  }

  return new Pool(config);
};

const getPoolInternal = (): Pool => {
  if (!pool) {
    pool = createPool();
  }
  return pool;
};

const createSchema = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      credential_type TEXT NOT NULL,
      details JSONB NOT NULL,
      issued_by TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL,
      hash TEXT NOT NULL
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_credentials_hash
    ON credentials (hash)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_credentials_issued_at
    ON credentials (issued_at)
  `);
};

export const getPool = (): Pool => getPoolInternal();

export const closeDatabase = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    memoryDb = null;
  }
};

export const initializeDatabase = async (): Promise<void> => {
  const poolInstance = getPoolInternal();
  const client = await poolInstance.connect();
  try {
    await createSchema(client);
  } finally {
    client.release();
  }
};
