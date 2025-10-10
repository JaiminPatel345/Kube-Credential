import sqlite3 from 'sqlite3';
import { open, type Database } from 'sqlite';
import { serviceConfig } from '../config';

sqlite3.verbose();

let databasePromise: Promise<Database<sqlite3.Database, sqlite3.Statement>> | null = null;

const createDatabase = async () => {
  const db = await open({
    filename: serviceConfig.databasePath,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec('PRAGMA journal_mode = WAL;');

  await db.exec(`
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

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_credentials_hash
    ON credentials (hash);
  `);

  return db;
};

export const getDatabase = async () => {
  if (!databasePromise) {
    databasePromise = createDatabase();
  }
  return databasePromise;
};

export const closeDatabase = async () => {
  if (databasePromise) {
    const db = await databasePromise;
    await db.close();
    databasePromise = null;
  }
};

export const initializeDatabase = async () => {
  await getDatabase();
};
