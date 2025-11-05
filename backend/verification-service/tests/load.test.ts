import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
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
  process.env.HOSTNAME = 'verification-load-test';
  process.env.PORT = '0';
  process.env.SYNC_SECRET = SYNC_SECRET;

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

describe('Load Testing - Verification Service', () => {
  it('handles 10 concurrent credential verification requests', async () => {
    // Seed database with credentials
    const db = getDatabase();
    const credentials: CredentialEntity[] = [];
    
    for (let i = 0; i < 10; i++) {
      const credential = buildCredential({
        id: `cred-${i}`,
        name: `User ${i}`,
        credentialType: 'test-credential',
        details: { userId: `user-${i}` }
      });
      
      credentials.push(credential);
      
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
    }

    const startTime = Date.now();
    const promises = credentials.map(credential => 
      request(app).post('/api/verify').send(credential)
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check all requests succeeded
    results.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });

    console.log(`✓ 10 concurrent verification requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / 10).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(10000 / duration).toFixed(2)} req/sec`);
  }, 15000);

  it('handles 50 concurrent credential verification requests', async () => {
    // Seed database with credentials
    const db = getDatabase();
    const credentials: CredentialEntity[] = [];
    
    for (let i = 0; i < 50; i++) {
      const credential = buildCredential({
        id: `cred-${i}`,
        name: `User ${i}`,
        credentialType: 'load-test',
        details: { userId: `user-${i}`, batch: 'batch-50' }
      });
      
      credentials.push(credential);
      
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
    }

    const startTime = Date.now();
    const promises = credentials.map(credential => 
      request(app).post('/api/verify').send(credential)
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check all requests succeeded
    const successCount = results.filter(r => r.status === 200 && r.body.valid === true).length;
    expect(successCount).toBe(50);

    console.log(`✓ 50 concurrent verification requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / 50).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(50000 / duration).toFixed(2)} req/sec`);
  }, 30000);

  it('handles 100 concurrent credential verification requests', async () => {
    // Seed database with credentials
    const db = getDatabase();
    const credentials: CredentialEntity[] = [];
    
    for (let i = 0; i < 100; i++) {
      const credential = buildCredential({
        id: `cred-${i}`,
        name: `User ${i}`,
        credentialType: 'load-test-100',
        details: { userId: `user-${i}`, batch: 'batch-100' }
      });
      
      credentials.push(credential);
      
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
    }

    const startTime = Date.now();
    const promises = credentials.map(credential => 
      request(app).post('/api/verify').send(credential)
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Check all requests succeeded
    const successCount = results.filter(r => r.status === 200 && r.body.valid === true).length;
    expect(successCount).toBe(100);

    console.log(`✓ 100 concurrent verification requests completed in ${duration}ms`);
    console.log(`  Average: ${(duration / 100).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(100000 / duration).toFixed(2)} req/sec`);
  }, 60000);

  it('handles mixed valid and invalid verification requests', async () => {
    // Seed database with 30 valid credentials
    const db = getDatabase();
    const validCredentials: CredentialEntity[] = [];
    
    for (let i = 0; i < 30; i++) {
      const credential = buildCredential({
        id: `valid-cred-${i}`,
        name: `User ${i}`,
        credentialType: 'mixed-test',
        details: { userId: `user-${i}` }
      });
      
      validCredentials.push(credential);
      
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
    }

    // Create 20 invalid credentials (not in database)
    const invalidCredentials: CredentialEntity[] = [];
    for (let i = 0; i < 20; i++) {
      const credential = buildCredential({
        id: `invalid-cred-${i}`,
        name: `Invalid User ${i}`,
        credentialType: 'mixed-test',
        details: { userId: `invalid-${i}` }
      });
      invalidCredentials.push(credential);
    }

    const allCredentials = [...validCredentials, ...invalidCredentials];
    
    // Shuffle to simulate random verification patterns
    for (let i = allCredentials.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCredentials[i], allCredentials[j]] = [allCredentials[j], allCredentials[i]];
    }

    const startTime = Date.now();
    const promises = allCredentials.map(credential => 
      request(app).post('/api/verify').send(credential)
    );

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Count valid and invalid results
    const validCount = results.filter(r => r.body.valid === true).length;
    const invalidCount = results.filter(r => r.body.valid === false).length;

    expect(validCount).toBe(30);
    expect(invalidCount).toBe(20);

    console.log(`✓ 50 mixed verification requests completed in ${duration}ms`);
    console.log(`  Valid: ${validCount}, Invalid: ${invalidCount}`);
    console.log(`  Average: ${(duration / 50).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(50000 / duration).toFixed(2)} req/sec`);
  }, 30000);

  it('handles sequential batches of verification requests', async () => {
    const batchSize = 20;
    const numBatches = 5;
    const totalRequests = batchSize * numBatches;

    // Seed database
    const db = getDatabase();
    const allCredentials: CredentialEntity[] = [];
    
    for (let i = 0; i < totalRequests; i++) {
      const credential = buildCredential({
        id: `batch-cred-${i}`,
        name: `User ${i}`,
        credentialType: 'sequential-batch',
        details: { userId: `user-${i}`, batch: `${Math.floor(i / batchSize)}` }
      });
      
      allCredentials.push(credential);
      
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
    }

    const startTime = Date.now();

    for (let batch = 0; batch < numBatches; batch++) {
      const batchCredentials = allCredentials.slice(
        batch * batchSize,
        (batch + 1) * batchSize
      );
      
      const promises = batchCredentials.map(credential => 
        request(app).post('/api/verify').send(credential)
      );

      await Promise.all(promises);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`✓ ${numBatches} batches of ${batchSize} verification requests completed in ${duration}ms`);
    console.log(`  Total requests: ${totalRequests}`);
    console.log(`  Average: ${(duration / totalRequests).toFixed(2)}ms per request`);
    console.log(`  Throughput: ${(totalRequests * 1000 / duration).toFixed(2)} req/sec`);
  }, 90000);

  it('measures response time distribution', async () => {
    const numRequests = 50;
    
    // Seed database
    const db = getDatabase();
    const credentials: CredentialEntity[] = [];
    
    for (let i = 0; i < numRequests; i++) {
      const credential = buildCredential({
        id: `response-time-cred-${i}`,
        name: `User ${i}`,
        credentialType: 'response-time-test',
        details: { userId: `user-${i}` }
      });
      
      credentials.push(credential);
      
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
    }

    const promises: Promise<{ response: any; duration: number }>[] = [];

    for (const credential of credentials) {
      const startTime = Date.now();
      const promise = request(app)
        .post('/api/verify')
        .send(credential)
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
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
    });
  }, 60000);

  it('handles health check under load', async () => {
    // Seed database
    const db = getDatabase();
    const credentials: CredentialEntity[] = [];
    
    for (let i = 0; i < 20; i++) {
      const credential = buildCredential({
        id: `health-test-cred-${i}`,
        name: `User ${i}`,
        credentialType: 'health-test',
        details: { userId: `user-${i}` }
      });
      
      credentials.push(credential);
      
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
    }

    // Start verifying credentials in background
    const verifyPromises = credentials.map(credential =>
      request(app).post('/api/verify').send(credential)
    );

    // Send health checks simultaneously
    const healthPromises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      healthPromises.push(request(app).get('/health'));
    }

    const [verifyResults, healthResults] = await Promise.all([
      Promise.all(verifyPromises),
      Promise.all(healthPromises)
    ]);

    // Verify credentials succeeded
    verifyResults.forEach((response) => {
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
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

      // Seed database
      const credentials: CredentialEntity[] = [];
      for (let i = 0; i < test.count; i++) {
        const credential = buildCredential({
          id: `perf-test-cred-${i}`,
          name: `User ${i}`,
          credentialType: 'perf-test',
          details: { userId: `user-${i}` }
        });
        
        credentials.push(credential);
        
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
      }

      const startTime = Date.now();
      const promises = credentials.map(credential =>
        request(app).post('/api/verify').send(credential)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      const successCount = results.filter(r => r.status === 200 && r.body.valid === true).length;
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
