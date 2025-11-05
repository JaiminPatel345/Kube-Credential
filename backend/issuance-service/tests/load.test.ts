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
  process.env.HOSTNAME = 'worker-load-test';
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

describe('Load Testing - Issuance Service', () => {
  it('handles 10 concurrent credential issuance requests', async () => {
    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    for (let i = 0; i < 10; i++) {
      const payload = {
        name: `User ${i}`,
        credentialType: 'test-credential',
        details: {
          userId: `user-${i}`,
          testId: `test-${i}`
        }
      };

      promises.push(request(app).post('/api/issue').send(payload));
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check all requests succeeded
    results.forEach((response) => {
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    // Check unique IDs
    const ids = results.map(r => r.body.credential.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);

    console.log(`✓ 10 concurrent requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / 10).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(10000 / duration).toFixed(2)} req/sec`);
  }, 15000);

  it('handles 50 concurrent credential issuance requests', async () => {
    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    for (let i = 0; i < 50; i++) {
      const payload = {
        name: `User ${i}`,
        credentialType: 'load-test',
        details: {
          userId: `user-${i}`,
          batch: 'batch-50'
        }
      };

      promises.push(request(app).post('/api/issue').send(payload));
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check all requests succeeded
    const successCount = results.filter(r => r.status === 201).length;
    expect(successCount).toBe(50);

    // Check unique IDs
    const ids = results.map(r => r.body.credential.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(50);

    console.log(`✓ 50 concurrent requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / 50).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(50000 / duration).toFixed(2)} req/sec`);
  }, 30000);

  it('handles 100 concurrent credential issuance requests', async () => {
    const startTime = Date.now();
    const promises: Promise<any>[] = [];

    for (let i = 0; i < 100; i++) {
      const payload = {
        name: `User ${i}`,
        credentialType: 'load-test-100',
        details: {
          userId: `user-${i}`,
          batch: 'batch-100'
        }
      };

      promises.push(request(app).post('/api/issue').send(payload));
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check all requests succeeded
    const successCount = results.filter(r => r.status === 201).length;
    expect(successCount).toBe(100);

    // Check unique IDs
    const ids = results.map(r => r.body.credential.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(100);

    console.log(`✓ 100 concurrent requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / 100).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(100000 / duration).toFixed(2)} req/sec`);
  }, 60000);

  it('handles sequential batches of requests', async () => {
    const batchSize = 20;
    const numBatches = 5;
    const totalRequests = batchSize * numBatches;
    const startTime = Date.now();

    for (let batch = 0; batch < numBatches; batch++) {
      const promises: Promise<any>[] = [];
      
      for (let i = 0; i < batchSize; i++) {
        const idx = batch * batchSize + i;
        const payload = {
          name: `User ${idx}`,
          credentialType: 'sequential-batch',
          details: {
            userId: `user-${idx}`,
            batch: `batch-${batch}`
          }
        };

        promises.push(request(app).post('/api/issue').send(payload));
      }

      await Promise.all(promises);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify all credentials were created
    const db = getDatabase();
    const count = db.prepare('SELECT COUNT(*) as count FROM credentials').get() as { count: number };
    expect(count.count).toBe(totalRequests);

    console.log(`✓ ${numBatches} batches of ${batchSize} requests completed in ${duration}ms`);
    console.log(`  Total requests: ${totalRequests}`);
    console.log(`  Average: ${(duration / totalRequests).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(totalRequests * 1000 / duration).toFixed(2)} req/sec`);
  }, 90000);

  it('maintains data integrity under concurrent load', async () => {
    const promises: Promise<any>[] = [];
    const credentialTypes = ['type-a', 'type-b', 'type-c', 'type-d', 'type-e'];

    for (let i = 0; i < 30; i++) {
      const payload = {
        name: `User ${i}`,
        credentialType: credentialTypes[i % credentialTypes.length],
        details: {
          userId: `user-${i}`,
          index: i.toString()
        }
      };

      promises.push(request(app).post('/api/issue').send(payload));
    }

    const results = await Promise.all(promises);
    
    // Verify all succeeded
    results.forEach((response) => {
      expect(response.status).toBe(201);
      expect(response.body.credential).toHaveProperty('id');
      expect(response.body.credential).toHaveProperty('hash');
      expect(response.body.credential).toHaveProperty('issuedAt');
    });

    // Verify database integrity
    const db = getDatabase();
    const credentials = db.prepare('SELECT * FROM credentials').all();
    
    expect(credentials.length).toBe(30);
    
    // Check all IDs are unique
    const ids = credentials.map((c: any) => c.id);
    expect(new Set(ids).size).toBe(30);
    
    // Check all hashes are unique
    const hashes = credentials.map((c: any) => c.hash);
    expect(new Set(hashes).size).toBe(30);

    console.log('✓ Data integrity maintained under concurrent load');
  }, 30000);

  it('measures response time distribution', async () => {
    const numRequests = 50;
    const promises: Promise<{ response: any; duration: number }>[] = [];

    for (let i = 0; i < numRequests; i++) {
      const payload = {
        name: `User ${i}`,
        credentialType: 'response-time-test',
        details: {
          userId: `user-${i}`
        }
      };

      const startTime = Date.now();
      const promise = request(app)
        .post('/api/issue')
        .send(payload)
        .then((response) => ({
          response,
          duration: Date.now() - startTime
        }));

      promises.push(promise);
    }

    const results = await Promise.all(promises);
    const durations = results.map(r => r.duration).sort((a, b) => a - b);

    const min = durations[0];
    const max = durations[durations.length - 1];
    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const p50 = durations[Math.floor(durations.length * 0.5)];
    const p90 = durations[Math.floor(durations.length * 0.9)];
    const p95 = durations[Math.floor(durations.length * 0.95)];
    const p99 = durations[Math.floor(durations.length * 0.99)];

    console.log('\n📊 Response Time Distribution (50 requests):');
    console.log(`  Min:  ${min}ms`);
    console.log(`  Max:  ${max}ms`);
    console.log(`  Avg:  ${avg.toFixed(2)}ms`);
    console.log(`  P50:  ${p50}ms`);
    console.log(`  P90:  ${p90}ms`);
    console.log(`  P95:  ${p95}ms`);
    console.log(`  P99:  ${p99}ms`);

    // Verify all requests succeeded
    results.forEach(({ response }) => {
      expect(response.status).toBe(201);
    });
  }, 60000);

  it('handles health check under load', async () => {
    // Start issuing credentials in background
    const credentialPromises: Promise<any>[] = [];
    for (let i = 0; i < 20; i++) {
      const payload = {
        name: `User ${i}`,
        credentialType: 'health-test',
        details: { userId: `user-${i}` }
      };
      credentialPromises.push(request(app).post('/api/issue').send(payload));
    }

    // Send health checks simultaneously
    const healthPromises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      healthPromises.push(request(app).get('/health'));
    }

    const [credentialResults, healthResults] = await Promise.all([
      Promise.all(credentialPromises),
      Promise.all(healthPromises)
    ]);

    // Verify credentials succeeded
    credentialResults.forEach((response) => {
      expect(response.status).toBe(201);
    });

    // Verify health checks succeeded
    healthResults.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('ok');
      expect(response.body.worker).toBeDefined();
    });

    console.log('✓ Health checks remain responsive under load');
  }, 30000);
});

describe('Performance Benchmarks', () => {
  it('provides performance summary', async () => {
    const tests = [
      { name: 'Light Load', count: 10 },
      { name: 'Medium Load', count: 50 },
      { name: 'Heavy Load', count: 100 }
    ];

    console.log('\n📈 Performance Summary:');
    console.log('─'.repeat(60));

    for (const test of tests) {
      const db = getDatabase();
      db.prepare('DELETE FROM credentials').run();

      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      for (let i = 0; i < test.count; i++) {
        const payload = {
          name: `User ${i}`,
          credentialType: 'perf-test',
          details: { userId: `user-${i}` }
        };
        promises.push(request(app).post('/api/issue').send(payload));
      }

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const successCount = results.filter(r => r.status === 201).length;
      const throughput = (test.count * 1000 / duration).toFixed(2);
      const avgTime = (duration / test.count).toFixed(2);

      console.log(`${test.name} (${test.count} requests):`);
      console.log(`  Success: ${successCount}/${test.count}`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Avg Time: ${avgTime}ms`);
      console.log(`  Throughput: ${throughput} req/sec`);
      console.log('─'.repeat(60));
    }
  }, 120000);
});
