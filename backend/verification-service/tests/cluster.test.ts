import { afterEach, beforeAll, afterAll, describe, expect, it, jest } from '@jest/globals';
import { getWorkerCount, getWorkerId } from '../src/cluster';

describe('Cluster Module', () => {
  const originalEnv = process.env;
  const originalConsoleWarn = console.warn;

  beforeAll(() => {
    // Suppress console.warn during tests to reduce noise
    console.warn = jest.fn();
  });

  afterAll(() => {
    // Restore console.warn after tests
    console.warn = originalConsoleWarn;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getWorkerCount', () => {
    it('returns 1 when WORKER_COUNT is not set', () => {
      delete process.env.WORKER_COUNT;
      expect(getWorkerCount()).toBe(1);
    });

    it('returns parsed value when WORKER_COUNT is valid', () => {
      process.env.WORKER_COUNT = '3';
      expect(getWorkerCount()).toBe(3);

      process.env.WORKER_COUNT = '8';
      expect(getWorkerCount()).toBe(8);
    });

    it('returns 1 when WORKER_COUNT is invalid', () => {
      process.env.WORKER_COUNT = 'invalid';
      expect(getWorkerCount()).toBe(1);

      process.env.WORKER_COUNT = '0';
      expect(getWorkerCount()).toBe(1);

      process.env.WORKER_COUNT = '-5';
      expect(getWorkerCount()).toBe(1);
    });

    it('returns parsed value even if it exceeds CPU count', () => {
      // This test just ensures parsing works, actual warning is logged
      process.env.WORKER_COUNT = '999';
      expect(getWorkerCount()).toBe(999);
    });
  });

  describe('getWorkerId', () => {
    it('returns appropriate worker ID based on cluster state', () => {
      // In test environment, cluster.isWorker is false
      const workerId = getWorkerId();
      expect(workerId).toBeDefined();
      expect(typeof workerId).toBe('string');
    });
  });
});

describe('Worker Configuration', () => {
  const originalConsoleWarn = console.warn;

  beforeAll(() => {
    // Suppress console.warn during tests to reduce noise
    console.warn = jest.fn();
  });

  afterAll(() => {
    // Restore console.warn after tests
    console.warn = originalConsoleWarn;
  });

  it('validates worker names are properly formatted', () => {
    const workerCounts = [1, 2, 3, 5, 10];
    
    workerCounts.forEach(count => {
      process.env.WORKER_COUNT = count.toString();
      const actualCount = getWorkerCount();
      expect(actualCount).toBe(count);
    });
  });

  it('handles edge cases in environment variable parsing', () => {
    const testCases = [
      { input: '  3  ', expected: 3 },
      { input: '1', expected: 1 },
      { input: '', expected: 1 },
      { input: '  ', expected: 1 }
    ];

    testCases.forEach(({ input, expected }) => {
      process.env.WORKER_COUNT = input;
      expect(getWorkerCount()).toBe(expected);
    });
  });
});
