import DatabaseConstructor from 'better-sqlite3';
import { serviceConfig } from '../config';

type BetterSqliteDatabase = DatabaseConstructor.Database;

let db: BetterSqliteDatabase | null = null;

const createDatabase = (): BetterSqliteDatabase => {
  const instance = new DatabaseConstructor(serviceConfig.databasePath, {
    fileMustExist: false
  });

  instance.pragma('foreign_keys = ON');
  instance.pragma('journal_mode = WAL');

  instance.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      credentialType TEXT NOT NULL,
      details TEXT NOT NULL,
      issuedBy TEXT NOT NULL,
      issuedAt TEXT NOT NULL,
      hash TEXT NOT NULL
    );
  `);

  instance.exec(`
    CREATE INDEX IF NOT EXISTS idx_credentials_hash
    ON credentials (hash);
  `);

  return instance;
};

export const getDatabase = (): BetterSqliteDatabase => {
  if (!db) {
    db = createDatabase();
  }
  return db;
};

export const closeDatabase = async (): Promise<void> => {
  if (db) {
    db.close();
    db = null;
  }
};

export const initializeDatabase = async (): Promise<void> => {
  getDatabase();
};
