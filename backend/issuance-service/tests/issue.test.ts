import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import type DatabaseConstructor from 'better-sqlite3';

type BetterSqliteDatabase = DatabaseConstructor.Database;

let app: Express;
let initializeDatabase: () => Promise<void>;
let closeDatabase: () => Promise<void>;
let getDatabase: () => BetterSqliteDatabase;
let originalFetch: typeof global.fetch;

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.HOSTNAME = 'worker-test';
  process.env.PORT = '0';
  process.env.VERIFICATION_SERVICE_URL = 'http://localhost:3002';
  process.env.SYNC_SECRET = '';

  jest.resetModules();

  originalFetch = global.fetch;
  global.fetch = mockFetch as unknown as typeof fetch;

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
  global.fetch = originalFetch;
});

beforeEach(() => {
  const db = getDatabase();
  db.prepare('DELETE FROM credentials').run();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
    text: async () => ''
  } as Response);
});

describe('POST /api/issue', () => {
  it('issues a new credential and returns the payload', async () => {
    const payload = {
      name: 'Alice Smith',
      credentialType: 'employee-id',
      details: {
        employeeId: 'E123',
        department: 'Engineering'
      }
    };

    const response = await request(app).post('/api/issue').send(payload).expect(201);

    expect(response.body).toMatchObject({
      success: true,
      message: 'credential issued by worker-test'
    });

    expect(response.body.credential).toMatchObject({
      id: expect.any(String),
      name: payload.name,
      credentialType: payload.credentialType,
      details: payload.details,
      issuedBy: 'worker-test'
    });

    expect(response.body.credential.id).toHaveLength(64);
    expect(response.body.credential.hash).toHaveLength(64);
    expect(Date.parse(response.body.credential.issuedAt)).not.toBeNaN();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3002/internal/sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' })
      })
    );
  });

  it('rejects duplicate credential issuance requests', async () => {
    const payload = {
      name: 'Bob Johnson',
      credentialType: 'access-card',
      details: {
        cardNumber: 'AC-4455'
      }
    };

    await request(app).post('/api/issue').send(payload).expect(201);

    const duplicateResponse = await request(app).post('/api/issue').send(payload).expect(409);

    expect(duplicateResponse.body).toEqual({
      success: false,
      message: 'Credential already issued'
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns validation errors when payload is invalid', async () => {
    const response = await request(app)
      .post('/api/issue')
      .send({
        name: ' ',
        credentialType: '',
        details: {}
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Invalid request payload');
    expect(Array.isArray(response.body.errors)).toBe(true);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects credentials with empty or null values in details', async () => {
    const payloadWithEmptyValue = {
      name: 'Test User',
      credentialType: 'test-credential',
      details: {
        "67": "hj",
        "87t": ""
      }
    };

    const response = await request(app)
      .post('/api/issue')
      .send(payloadWithEmptyValue)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('cannot be empty');
    expect(Array.isArray(response.body.errors)).toBe(true);

    const payloadWithNullValue = {
      name: 'Test User',
      credentialType: 'test-credential',
      details: {
        "key1": "value1",
        "key2": null
      }
    };

    const response2 = await request(app)
      .post('/api/issue')
      .send(payloadWithNullValue)
      .expect(400);

    expect(response2.body.success).toBe(false);
    expect(response2.body.message).toContain('cannot be null or undefined');
    expect(Array.isArray(response2.body.errors)).toBe(true);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects credentials with empty or whitespace-only keys in details', async () => {
    const payloadWithEmptyKey = {
      name: 'Test User',
      credentialType: 'test-credential',
      details: {
        "": "value1",
        "key2": "value2"
      }
    };

    const response = await request(app)
      .post('/api/issue')
      .send(payloadWithEmptyKey)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Detail keys cannot be empty');
    expect(Array.isArray(response.body.errors)).toBe(true);

    const payloadWithWhitespaceKey = {
      name: 'Test User',
      credentialType: 'test-credential',
      details: {
        "   ": "value1",
        "key2": "value2"
      }
    };

    const response2 = await request(app)
      .post('/api/issue')
      .send(payloadWithWhitespaceKey)
      .expect(400);

    expect(response2.body.success).toBe(false);
    expect(response2.body.message).toContain('Detail keys cannot be empty');
    expect(Array.isArray(response2.body.errors)).toBe(true);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects credentials with value but empty key in details', async () => {
    const payloadWithValueButEmptyKey = {
      name: 'Test User',
      credentialType: 'test-credential',
      details: {
        "": "some value"
      }
    };

    const response = await request(app)
      .post('/api/issue')
      .send(payloadWithValueButEmptyKey)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('Detail keys cannot be empty');
    expect(Array.isArray(response.body.errors)).toBe(true);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects credentials with whitespace-only values in details', async () => {
    const payloadWithWhitespaceValue = {
      name: 'Test User',
      credentialType: 'test-credential',
      details: {
        "key1": "   ",
        "key2": "value2"
      }
    };

    const response = await request(app)
      .post('/api/issue')
      .send(payloadWithWhitespaceValue)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('cannot be only whitespace');
    expect(Array.isArray(response.body.errors)).toBe(true);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('retries sync before logging failure but still responds with success', async () => {
    const payload = {
      name: 'Charlie Day',
      credentialType: 'access-card',
      details: {
        cardNumber: 'AC-7777'
      }
    };

    const networkError = new Error('network down');
    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await request(app).post('/api/issue').send(payload).expect(201);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
