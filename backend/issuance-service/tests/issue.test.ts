import request from 'supertest';
import type { Express } from 'express';

let app: Express;
let initializeDatabase: () => Promise<void>;
let closeDatabase: () => Promise<void>;
let getDatabase: () => Promise<{ exec: (sql: string) => Promise<unknown> }>;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = ':memory:';
  process.env.HOSTNAME = 'worker-test';
  process.env.PORT = '0';

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

beforeEach(async () => {
  const db = await getDatabase();
  await db.exec('DELETE FROM credentials');
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
  });
});
