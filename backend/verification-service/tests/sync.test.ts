import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type DatabaseConstructor from 'better-sqlite3';

import type { performCatchUpSync as PerformCatchUpSyncFn } from '../src/utils/sync';
import type { CredentialEntity } from '../src/models/credentialModel';
import type { credentialModel as CredentialModel } from '../src/models/credentialModel';
import type { generateIntegrityHash as GenerateIntegrityHashFn } from '../src/utils/hash';

type BetterSqliteDatabase = DatabaseConstructor.Database;

let initializeDatabase: () => Promise<void>;
let closeDatabase: () => Promise<void>;
let getDatabase: () => BetterSqliteDatabase;
let originalFetch: typeof global.fetch;
let fetchMock: jest.MockedFunction<typeof fetch>;
let performCatchUpSync: typeof PerformCatchUpSyncFn;
let credentialModel: typeof CredentialModel;
let generateIntegrityHash: typeof GenerateIntegrityHashFn;

const buildJsonResponse = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response);

const buildRemoteCredential = (overrides?: Partial<CredentialEntity>): CredentialEntity => {
  const base: CredentialEntity = {
    id: `cred-${Math.random().toString(16).slice(2, 10)}`,
    name: 'Sync User',
    credentialType: 'employee-id',
    details: { employeeId: 'SYNC-1' },
    issuedBy: 'worker-issuer-sync',
    issuedAt: '2024-03-01T00:00:00.000Z',
    hash: ''
  };

  const credential = { ...base, ...overrides };
  const { hash, ...withoutHash } = credential;
  return { ...credential, hash: generateIntegrityHash(withoutHash) };
};

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.HOSTNAME = 'verification-sync-test';
  process.env.PORT = '0';
  process.env.SYNC_SECRET = 'top-secret';
  process.env.ISSUANCE_SERVICE_URL = 'http://issuance-service:3001';

  jest.resetModules();

  const databaseModule = await import('../src/utils/database');
  ({ performCatchUpSync } = await import('../src/utils/sync'));
  ({ credentialModel } = await import('../src/models/credentialModel'));
  ({ generateIntegrityHash } = await import('../src/utils/hash'));

  initializeDatabase = databaseModule.initializeDatabase;
  closeDatabase = databaseModule.closeDatabase;
  getDatabase = databaseModule.getDatabase;

  await initializeDatabase();

  originalFetch = global.fetch;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(async () => {
  await closeDatabase();
  global.fetch = originalFetch;
});

beforeEach(() => {
  const db = getDatabase();
  db.prepare('DELETE FROM credentials').run();
  fetchMock.mockReset();
});

describe('performCatchUpSync', () => {
  it('imports credentials when issuance service returns data', async () => {
    const remoteCredential = buildRemoteCredential();

    fetchMock.mockResolvedValue(buildJsonResponse({ success: true, count: 1, data: [remoteCredential] }));

    const inserted = await performCatchUpSync();

    expect(inserted).toBe(1);

    const stored = credentialModel.findById(remoteCredential.id);
    expect(stored).toMatchObject({
      id: remoteCredential.id,
      issuedAt: remoteCredential.issuedAt
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://issuance-service:3001/internal/credentials',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-internal-sync-key': 'top-secret' })
      })
    );
  });

  it('passes since parameter when local credentials exist', async () => {
    const existing = buildRemoteCredential({ id: 'existing', issuedAt: '2024-04-01T00:00:00.000Z' });
    credentialModel.upsert(existing);

    const newer = buildRemoteCredential({ id: 'newer', issuedAt: '2024-05-01T00:00:00.000Z' });

    fetchMock.mockResolvedValue(buildJsonResponse({ success: true, count: 1, data: [newer] }));

    const inserted = await performCatchUpSync();

    expect(inserted).toBe(1);

    const callArgs = fetchMock.mock.calls[0] as [string];
    expect(callArgs[0]).toContain('since=2024-04-01T00%3A00%3A00.000Z');
  });

  it('throws when issuance service responds with invalid payload', async () => {
    fetchMock.mockResolvedValue(buildJsonResponse({ success: false }));

    await expect(performCatchUpSync()).rejects.toThrow('Invalid response from issuance service');
  });
});
