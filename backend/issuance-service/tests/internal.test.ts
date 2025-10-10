import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import type DatabaseConstructor from 'better-sqlite3';

import type { CredentialEntity } from '../src/models/credentialModel';
import { generateIntegrityHash } from '../src/utils/hash';

type BetterSqliteDatabase = DatabaseConstructor.Database;

let app: Express;
let initializeDatabase: () => Promise<void>;
let closeDatabase: () => Promise<void>;
let getDatabase: () => BetterSqliteDatabase;

const buildCredential = (overrides?: Partial<CredentialEntity>): CredentialEntity => {
  const base: CredentialEntity = {
    id: `cred-${Math.random().toString(16).slice(2, 10)}`,
    name: 'Test User',
    credentialType: 'employee-id',
    details: { employeeId: 'E-1' },
    issuedBy: 'worker-internal-test',
    issuedAt: new Date().toISOString(),
    hash: ''
  };

  const credential = { ...base, ...overrides };
  const { hash, ...withoutHash } = credential;
  return { ...credential, hash: generateIntegrityHash(withoutHash) };
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.HOSTNAME = 'worker-test';
  process.env.SYNC_SECRET = 'top-secret';

  jest.resetModules();

  const indexModule = await import('../src/index');
  const databaseModule = await import('../src/utils/database');

  app = indexModule.createApp();
  initializeDatabase = databaseModule.initializeDatabase;
  closeDatabase = databaseModule.closeDatabase;
  getDatabase = databaseModule.getDatabase;

  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
});

beforeEach(() => {
  const db = getDatabase();
  db.prepare('DELETE FROM credentials').run();
});

describe('GET /internal/credentials', () => {
  it('returns credentials when authorized', async () => {
    const credentialA = buildCredential({ issuedAt: '2024-01-01T00:00:00.000Z' });
    const credentialB = buildCredential({ issuedAt: '2024-02-01T00:00:00.000Z' });
    const db = getDatabase();

    const insert = db.prepare(
      'INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const credential of [credentialA, credentialB]) {
      insert.run(
        credential.id,
        credential.name,
        credential.credentialType,
        JSON.stringify(credential.details),
        credential.issuedBy,
        credential.issuedAt,
        credential.hash
      );
    }

    const response = await request(app)
      .get('/internal/credentials')
      .set('x-internal-sync-key', 'top-secret')
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      count: 2,
      data: [
        expect.objectContaining({ id: credentialA.id }),
        expect.objectContaining({ id: credentialB.id })
      ]
    });
  });

  it('filters credentials using since parameter', async () => {
    const credentialA = buildCredential({ issuedAt: '2024-01-01T00:00:00.000Z' });
    const credentialB = buildCredential({ issuedAt: '2024-02-01T00:00:00.000Z' });
    const db = getDatabase();

    const insert = db.prepare(
      'INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    for (const credential of [credentialA, credentialB]) {
      insert.run(
        credential.id,
        credential.name,
        credential.credentialType,
        JSON.stringify(credential.details),
        credential.issuedBy,
        credential.issuedAt,
        credential.hash
      );
    }

    const response = await request(app)
      .get('/internal/credentials')
      .query({ since: '2024-01-15T00:00:00.000Z' })
      .set('x-internal-sync-key', 'top-secret')
      .expect(200);

    expect(response.body.count).toBe(1);
    expect(response.body.data[0]).toMatchObject({ id: credentialB.id });
  });

  it('rejects unauthorized access when sync secret configured', async () => {
    await request(app).get('/internal/credentials').expect(401);
  });

  it('rejects invalid since parameter', async () => {
    const response = await request(app)
      .get('/internal/credentials')
      .set('x-internal-sync-key', 'top-secret')
      .query({ since: 'not-a-date' })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Invalid since parameter. Expect ISO-8601 string.'
    });
  });
});
