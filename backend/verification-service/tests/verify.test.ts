import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import type DatabaseConstructor from 'better-sqlite3';

import { generateIntegrityHash } from '../src/utils/hash';
import type { CredentialEntity } from '../src/models/credentialModel';

type BetterSqliteDatabase = DatabaseConstructor.Database;

const SYNC_SECRET = 'test-sync-secret';

let app: Express;
let initializeDatabase: () => Promise<void>;
let closeDatabase: () => Promise<void>;
let getDatabase: () => BetterSqliteDatabase;

const buildCredential = (overrides?: Partial<CredentialEntity>): CredentialEntity => {
  const base: CredentialEntity = {
    id: 'cred-1',
    name: 'Alice Smith',
    credentialType: 'employee-id',
    details: {
      employeeId: 'E123',
      department: 'Engineering'
    },
    issuedBy: 'worker-issuer-1',
    issuedAt: '2024-01-01T12:00:00.000Z',
    hash: ''
  };

  const credential = { ...base, ...overrides };
  const { hash, ...withoutHash } = credential;
  const recomputedHash = generateIntegrityHash(withoutHash);
  return { ...credential, hash: recomputedHash };
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.HOSTNAME = 'verification-test';
  process.env.PORT = '0';
  process.env.SYNC_SECRET = SYNC_SECRET;

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

describe('POST /api/verify', () => {
  it('returns valid true when credential matches database record', async () => {
    const credential = buildCredential();
    const db = getDatabase();
    db.prepare(
      'INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      credential.id,
      credential.name,
      credential.credentialType,
      JSON.stringify(credential.details),
      credential.issuedBy,
      credential.issuedAt,
      credential.hash
    );

    const response = await request(app).post('/api/verify').send(credential).expect(200);

    expect(response.body).toEqual({
      valid: true,
      message: 'Credential verified successfully',
      issuedBy: credential.issuedBy,
      issuedAt: credential.issuedAt,
      verifiedBy: 'worker-verification-test'
    });
  });

  it('returns valid false when credential not found', async () => {
    const credential = buildCredential();

    const response = await request(app).post('/api/verify').send(credential).expect(200);

    expect(response.body).toEqual({
      valid: false,
      message: 'Credential not found',
      issuedBy: null,
      issuedAt: null,
      verifiedBy: 'worker-verification-test'
    });
  });

  it('returns valid false when credential hash mismatches', async () => {
    const credential = buildCredential();
    const db = getDatabase();
    db.prepare(
      'INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      credential.id,
      credential.name,
      credential.credentialType,
      JSON.stringify(credential.details),
      credential.issuedBy,
      credential.issuedAt,
      credential.hash
    );

    const tampered = { ...credential, name: 'Alice Tampered' };

    const response = await request(app).post('/api/verify').send(tampered).expect(200);

    expect(response.body).toEqual({
      valid: false,
      message: 'Credential data mismatch',
      issuedBy: credential.issuedBy,
      issuedAt: credential.issuedAt,
      verifiedBy: 'worker-verification-test'
    });
  });
});

describe('POST /internal/sync', () => {
  it('persists credential when hash matches', async () => {
    const credential = buildCredential();

    const response = await request(app)
      .post('/internal/sync')
      .set('x-internal-sync-key', SYNC_SECRET)
      .send(credential)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      message: 'Credential synchronized successfully'
    });

    const db = getDatabase();
    const row = db
      .prepare('SELECT id, name, credentialType, details, issuedBy, issuedAt, hash FROM credentials WHERE id = ?')
      .get(credential.id);

    expect(row).toMatchObject({
      id: credential.id,
      name: credential.name,
      credentialType: credential.credentialType,
      issuedBy: credential.issuedBy,
      issuedAt: credential.issuedAt,
      hash: credential.hash
    });
  });

  it('rejects credential when hash invalid', async () => {
    const credential = buildCredential();
    const invalidPayload = { ...credential, hash: '0'.repeat(64) };

    const response = await request(app)
      .post('/internal/sync')
      .set('x-internal-sync-key', SYNC_SECRET)
      .send(invalidPayload)
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      message: 'Invalid credential hash'
    });
  });
});
