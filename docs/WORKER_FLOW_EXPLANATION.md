# Complete Worker Creation Flow - Step by Step

## Full Execution Flow Diagram

```
npm start / WORKER_COUNT=3 npm start
    ↓
index.ts (Main Entry Point)
    ↓
[CONFIG PHASE] Load environment variables
    ↓ (calls config.ts)
    ├─→ dotenv.config() - Load .env file
    ├─→ parsePort(PORT) - Get port (default: 3001)
    ├─→ resolveDatabasePath(DATABASE_PATH) - Setup DB path
    ├─→ getProcessWorkerId() - Get worker ID
    │   ├─→ Check: Is this a worker process?
    │   ├─→ Fallback: Check HOSTNAME env var
    │   └─→ Default: Return 'worker-1'
    └─→ Create serviceConfig object with all settings
    ↓
[DECISION POINT] Check NODE_ENV and WORKER_COUNT
    ↓
if (process.env.NODE_ENV !== 'test')
    ├─→ Call getWorkerCount()
    │   ├─→ Read WORKER_COUNT env var (default: 1)
    │   ├─→ Validate: Is it a valid number?
    │   ├─→ Validate: Is it > 0?
    │   ├─→ Validate: Compare with os.cpus().length
    │   │   └─→ If WORKER_COUNT > CPU count: WARN user
    │   └─→ Return: Number of workers to create
    │
    ├─→ if (workerCount > 1)
    │   ├─→ YES: Enter CLUSTER MODE
    │   │   ├─→ Check: cluster.isPrimary?
    │   │   │
    │   │   ├─→ YES: This is the MASTER process
    │   │   │   └─→ Call setupMaster('Issuance Service')
    │   │   │       ├─→ Log: "[Master] Starting with X worker(s)"
    │   │   │       ├─→ FOR LOOP: i = 0 to workerCount-1
    │   │   │       │   ├─→ Call cluster.fork()
    │   │   │       │   │   ├─→ Creates child process
    │   │   │       │   │   ├─→ Copies entire code to child
    │   │   │       │   │   └─→ Child starts from index.ts again
    │   │   │       │   │
    │   │   │       │   └─→ Set up message listener on child
    │   │   │       │       └─→ When child sends 'ready':
    │   │   │       │           ├─→ readyWorkers++
    │   │   │       │           ├─→ Log: "[Master] Worker X is ready [Y/Z]"
    │   │   │       │           └─→ When all ready: call onWorkerReady()
    │   │   │       │
    │   │   │       ├─→ Set up cluster.on('exit') listener
    │   │   │       │   └─→ If a worker dies:
    │   │   │       │       ├─→ Log why it died
    │   │   │       │       ├─→ Call cluster.fork() again (RESPAWN)
    │   │   │       │       └─→ Set up listener on new worker
    │   │   │       │
    │   │   │       └─→ Set up SIGTERM/SIGINT handlers
    │   │   │           ├─→ Send SIGTERM to all workers
    │   │   │           ├─→ Wait 10 seconds
    │   │   │           └─→ Force exit if not done
    │   │   │
    │   │   └─→ NO: This is a WORKER process
    │   │       └─→ Call startWorker()
    │   │           ├─→ await initializeDatabase()
    │   │           │   └─→ Open SQLite connection for THIS worker
    │   │           │
    │   │           ├─→ const app = createApp()
    │   │           │   ├─→ Create Express instance
    │   │           │   ├─→ Set up CORS
    │   │           │   ├─→ Set up JSON middleware
    │   │           │   ├─→ Set up /health endpoint
    │   │           │   │   └─→ Returns: { success, message, worker: workerID }
    │   │           │   ├─→ Mount routes: /api and /internal
    │   │           │   └─→ Set up error handlers
    │   │           │
    │   │           ├─→ app.listen(port, callback)
    │   │           │   ├─→ Server starts listening
    │   │           │   ├─→ Log: "[worker-X] Service listening on port 3001"
    │   │           │   │
    │   │           │   └─→ Inside callback:
    │   │           │       └─→ Call notifyReady()
    │   │           │           └─→ Send 'ready' message to master process
    │   │           │
    │   │           └─→ If error: log and exit(1)
    │   │
    │   └─→ NO: workerCount === 1 (Single worker)
    │       └─→ Call startWorker() directly (no clustering)
    │           └─→ Same process as above, but no master
    │
    └─→ const app = createApp()
        └─→ For testing/export purposes
```

---

## Detailed Step-by-Step Explanation

### **STEP 1: Program Start**
**Location:** `backend/issuance-service/src/index.ts` (lines 1-10)

```typescript
import cluster from 'cluster';
import { getWorkerCount, setupMaster, notifyReady } from './cluster';
import { serviceConfig } from './config';
```

When you run `npm start` or `WORKER_COUNT=3 npm start`, Node.js loads the entire `index.ts` file. All imports are executed immediately.

**What happens:**
- `cluster` module is imported (Node.js built-in for multi-processing)
- Functions from `cluster.ts` are imported
- Configuration is loaded from `config.ts`

---

### **STEP 2: Load Configuration**
**Location:** `backend/issuance-service/src/config.ts` (lines 1-80)

```typescript
const getProcessWorkerId = (): string => {
  if (cluster.isWorker && cluster.worker) {
    return `worker-${cluster.worker.id}`;
  }
  const hostname = process.env.HOSTNAME?.trim();
  if (hostname) return hostname;
  return 'worker-1';
};

const workerId = getProcessWorkerId();
export const serviceConfig = { port, databasePath, workerId, ... };
```

**What happens:**
1. `dotenv.config()` loads `.env` file environment variables
2. All parsing functions run:
   - `parsePort()` → defaults to 3001
   - `resolveDatabasePath()` → creates data/ directory if needed
   - `getProcessWorkerId()` → determines this process's worker ID
3. `serviceConfig` object is created with all settings

**At this point (FIRST TIME):**
- If starting fresh, `cluster.isWorker` is `false` (still in master)
- `workerId` gets default value (or HOSTNAME)

---

### **STEP 3: Decision Point - Check WORKER_COUNT**
**Location:** `backend/issuance-service/src/index.ts` (lines 100-115)

```typescript
if (process.env.NODE_ENV !== 'test') {
  const workerCount = getWorkerCount();
  
  if (workerCount > 1) {
    if (cluster.isPrimary) {
      setupMaster('Issuance Service');
    } else {
      startWorker();
    }
  } else {
    startWorker();
  }
}
```

**What happens:**
- Calls `getWorkerCount()` from `cluster.ts`
  - Reads `WORKER_COUNT` env var
  - Defaults to 1 if not set
  - Validates and warns if exceeds CPU count

**Example:** If `WORKER_COUNT=3`:
- `workerCount = 3`
- Goes to `if (workerCount > 1)` → TRUE
- Checks `cluster.isPrimary` → TRUE (first process is always primary)
- **Calls `setupMaster('Issuance Service')`** ← KEY FUNCTION

---

### **STEP 4: Master Process Setup**
**Location:** `backend/issuance-service/src/cluster.ts` (lines 46-75)

```typescript
export const setupMaster = (serviceName: string): void => {
  const workerCount = getWorkerCount();
  
  console.info(`[Master] ${serviceName} starting in cluster mode with ${workerCount} worker(s)`);
  
  let readyWorkers = 0;
  const expectedWorkers = workerCount;
  
  // FOR LOOP: Create N workers
  for (let i = 0; i < workerCount; i++) {
    const worker = cluster.fork();  // ← CREATES CHILD PROCESS
    
    worker.on('message', (msg) => {
      if (msg === 'ready') {
        readyWorkers++;
        console.info(`[Master] Worker ${worker.id} (worker-${worker.id}) is ready [${readyWorkers}/${expectedWorkers}]`);
        
        if (readyWorkers === expectedWorkers && onWorkerReady) {
          onWorkerReady();
        }
      }
    });
  }
  
  // Handle worker crash and respawn
  cluster.on('exit', (worker, code, signal) => {
    console.error(`[Master] Worker ${worker.id} died. Restarting...`);
    const newWorker = cluster.fork(); // ← RESPAWN
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => { /* kill workers */ });
};
```

**What happens - WORKER 1 CREATION:**
1. Master logs: `"[Master] Issuance Service starting in cluster mode with 3 worker(s)"`
2. Loop iteration i=0:
   - **`cluster.fork()` is called**
   - This spawns a NEW child process
   - The entire `index.ts` code is copied to the child
   - Child process starts executing from the top

**What happens - WORKER 2 CREATION:**
3. Loop iteration i=1:
   - **Another `cluster.fork()` is called**
   - Second child process is created
   - Second child also executes `index.ts` from the top

**What happens - WORKER 3 CREATION:**
4. Loop iteration i=2:
   - **Third `cluster.fork()` is called**
   - Third child process is created
   - Third child also executes `index.ts` from the top

**After fork():**
- Master sets up `worker.on('message', ...)` listener
- Waits for worker to send 'ready' message

---

### **STEP 5: Worker Process Initialization (Child Process)**
**What happens INSIDE each forked child:**

When a worker is forked, it starts `index.ts` again, but NOW:
- `cluster.isWorker = true` (this is a worker child, not primary)
- `cluster.worker.id = 1, 2, or 3` (unique ID)

**Execution path for FIRST CHILD:**

1. **Load config again** (config.ts runs again in child)
   ```typescript
   const getProcessWorkerId = (): string => {
     if (cluster.isWorker && cluster.worker) {  // ← NOW TRUE!
       return `worker-${cluster.worker.id}`;    // ← Returns "worker-1"
     }
   };
   ```
   - `workerId = "worker-1"`

2. **Reach decision point** (index.ts lines 100-115)
   ```typescript
   const workerCount = getWorkerCount(); // ← Still 3
   
   if (workerCount > 1) {
     if (cluster.isPrimary) {  // ← FALSE (this is a child!)
       setupMaster(...);
     } else {
       startWorker();  // ← GOES HERE!
     }
   }
   ```
   - Goes to `else` → **calls `startWorker()`**

---

### **STEP 6: Worker Initialization**
**Location:** `backend/issuance-service/src/index.ts` (lines 85-97)

```typescript
const startWorker = async () => {
  try {
    // STEP 6A: Initialize database for THIS worker
    await initializeDatabase();
    
    // STEP 6B: Create Express app
    const app = createApp();
    const { port } = serviceConfig;
    const workerId = getWorkerLabel();
    
    // STEP 6C: Start listening on port
    app.listen(port, () => {
      console.info(`[${workerId}] Issuance service listening on port ${port}`);
      notifyReady();  // ← SEND MESSAGE TO MASTER
    });
  } catch (error) {
    console.error('Failed to start worker', error);
    process.exit(1);
  }
};
```

**STEP 6A - Database Initialization:**
```typescript
await initializeDatabase();
```
- Each worker opens its own SQLite connection
- WAL (Write-Ahead Logging) mode ensures multiple processes can safely share the same DB file
- Worker-specific database session is created

**STEP 6B - Create Express App:**
```typescript
const app = createApp();
```
- Creates Express instance
- Sets up routes, middleware, error handlers
- Prepares `/health`, `/api/issue`, `/internal` endpoints
- Each worker has its own Express server instance

**STEP 6C - Start Listening:**
```typescript
app.listen(port, () => {
  console.info(`[worker-1] Issuance service listening on port 3001`);
  notifyReady();
});
```
- Calls Express `listen()` method
- Server binds to port 3001
- All 3 workers can listen on same port (Node cluster magic)
- **Calls `notifyReady()`** ← CRITICAL!

---

### **STEP 7: Worker Ready Notification**
**Location:** `backend/issuance-service/src/cluster.ts` (lines 116-122)

```typescript
export const notifyReady = (): void => {
  if (cluster.isWorker && process.send) {
    process.send('ready');  // ← Send message to parent (master)
  }
};
```

**What happens:**
- Worker sends `'ready'` message to master process
- Master receives this message in the listener from Step 4:
  ```typescript
  worker.on('message', (msg) => {
    if (msg === 'ready') {
      readyWorkers++;  // ← Increment counter (0 → 1, 1 → 2, 2 → 3)
      console.info(`[Master] Worker ${worker.id} is ready [${readyWorkers}/${expectedWorkers}]`);
      
      if (readyWorkers === expectedWorkers && onWorkerReady) {
        onWorkerReady();  // ← Called when all 3 are ready
      }
    }
  });
  ```

**Timeline:**
- Worker 1 fork → Worker 1 starts → sends 'ready' → readyWorkers = 1 → Log: "[Master] Worker 1 is ready [1/3]"
- Worker 2 fork → Worker 2 starts → sends 'ready' → readyWorkers = 2 → Log: "[Master] Worker 2 is ready [2/3]"
- Worker 3 fork → Worker 3 starts → sends 'ready' → readyWorkers = 3 → Log: "[Master] Worker 3 is ready [3/3]"
  - **All ready!** → If `onWorkerReady` callback exists, it's called

---

### **STEP 8: Running State - Request Distribution**

```
CLIENT REQUEST
    ↓
All 3 workers listening on port 3001
    ↓
OS-level load balancing distributes to one worker
    ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Worker 1   │  │  Worker 2   │  │  Worker 3   │
│  Running    │  │  Running    │  │  Running    │
│  Handling   │  │  Waiting    │  │  Waiting    │
│  Request    │  │  for work   │  │  for work   │
│  /api/issue │  │             │  │             │
└─────────────┘  └─────────────┘  └─────────────┘
    ↓
Response includes worker ID
    ↓
Next request might go to Worker 2
    ↓
And so on...
```

**Load Distribution:**
- Each worker independently handles requests
- Node.js cluster balances incoming connections
- Each worker has its own event loop
- Parallel processing across multiple cores

---

### **STEP 9: Fault Tolerance - Worker Crash**

If a worker crashes:

```typescript
cluster.on('exit', (worker, code, signal) => {
  const exitReason = signal ? `signal ${signal}` : `code ${code}`;
  console.error(`[Master] Worker ${worker.id} (worker-${worker.id}) died (${exitReason}). Restarting...`);
  
  const newWorker = cluster.fork();  // ← RESPAWN immediately
  
  newWorker.on('message', (msg) => {
    if (msg === 'ready') {
      console.info(`[Master] Replacement worker ${newWorker.id} is ready`);
    }
  });
});
```

**What happens:**
1. Worker 2 crashes → Master detects `'exit'` event
2. Master logs the error
3. Master calls `cluster.fork()` to create new worker
4. New worker goes through Steps 5-7 again
5. Service continues with full capacity

---

### **STEP 10: Graceful Shutdown**

```typescript
const shutdown = () => {
  console.info('[Master] Shutting down cluster...');
  
  for (const id in cluster.workers) {
    const worker = cluster.workers[id];
    if (worker) {
      worker.kill('SIGTERM');  // ← Send SIGTERM to each worker
    }
  }
  
  setTimeout(() => {
    console.info('[Master] Force shutdown');
    process.exit(0);  // ← Exit after timeout
  }, 10000);  // ← 10 second timeout
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**What happens:**
1. User presses Ctrl+C or sends SIGTERM
2. Master's shutdown handler is triggered
3. Master sends SIGTERM to all 3 workers
4. Workers close their servers gracefully (drain connections)
5. After 10 seconds, master force-exits
6. All processes terminate cleanly

---

## Complete Timeline Example - WORKER_COUNT=3

```
T=0ms:     npm start (WORKER_COUNT=3)
T=1ms:     Load index.ts → config.ts runs → workerId="worker-1" (but isPrimary=true)
T=5ms:     getWorkerCount() returns 3
T=10ms:    cluster.isPrimary=true → call setupMaster()
T=15ms:    [Master] Issuance Service starting in cluster mode with 3 worker(s)
           
T=20ms:    FORK 1: cluster.fork() → Child 1 created
T=25ms:    Child 1 loads index.ts → config.ts runs → workerId="worker-1" (isWorker=true)
T=30ms:    Child 1 calls startWorker()
T=35ms:    Child 1 initializes database
T=40ms:    Child 1 creates Express app
T=45ms:    Child 1 app.listen(3001)
T=50ms:    Child 1 logs: "[worker-1] Issuance service listening on port 3001"
T=55ms:    Child 1 sends 'ready' message to master
T=60ms:    Master receives 'ready' → readyWorkers=1
           [Master] Worker 1 (worker-1) is ready [1/3]
           
T=65ms:    FORK 2: cluster.fork() → Child 2 created
T=70ms:    Child 2 loads index.ts → workerId="worker-2"
T=75ms:    Child 2 initializes database
T=80ms:    Child 2 creates Express app
T=85ms:    Child 2 app.listen(3001)
T=90ms:    Child 2 logs: "[worker-2] Issuance service listening on port 3001"
T=95ms:    Child 2 sends 'ready'
T=100ms:   Master receives 'ready' → readyWorkers=2
           [Master] Worker 2 (worker-2) is ready [2/3]
           
T=105ms:   FORK 3: cluster.fork() → Child 3 created
T=110ms:   Child 3 loads index.ts → workerId="worker-3"
T=115ms:   Child 3 initializes database
T=120ms:   Child 3 creates Express app
T=125ms:   Child 3 app.listen(3001)
T=130ms:   Child 3 logs: "[worker-3] Issuance service listening on port 3001"
T=135ms:   Child 3 sends 'ready'
T=140ms:   Master receives 'ready' → readyWorkers=3
           [Master] Worker 3 (worker-3) is ready [3/3]
           ✓ ALL WORKERS READY!
           
T=145ms+:  Service accepts requests on port 3001
           OS distributes to workers: 1 → 2 → 3 → 1 → 2 → 3...
```

---

## Key Functions Summary

| Function | Location | Purpose |
|----------|----------|---------|
| `getWorkerCount()` | cluster.ts:7-28 | Read WORKER_COUNT env, validate, return count |
| `setupMaster()` | cluster.ts:46-115 | Fork N workers, track readiness, handle crashes |
| `startWorker()` | index.ts:85-97 | Initialize worker: DB, Express, listen, notify |
| `cluster.fork()` | Node.js built-in | Create child process (copies entire code) |
| `notifyReady()` | cluster.ts:116-122 | Send 'ready' message from worker to master |
| `cluster.on('exit')` | cluster.ts:87-98 | Detect worker crash and respawn |
| `shutdown()` | cluster.ts:101-115 | Graceful termination of all workers |

---

## Important Concepts

### **IPC (Inter-Process Communication)**
Workers communicate with master via messages:
```typescript
// Worker sends
process.send('ready');

// Master receives
worker.on('message', (msg) => { ... });
```

### **Shared Port, Separate Processes**
All workers listen on 3001, but they're separate processes:
- Each has own memory
- Each has own database connection (same file via WAL)
- Each has own Event Loop (parallel execution)
- OS kernel handles load balancing

### **Forking Overhead**
`cluster.fork()` is not lightweight:
- Entire V8 engine cloned
- All code loaded into memory for each worker
- Worker count should typically = CPU count

### **Database Sharing**
SQLite with WAL mode allows:
- Multiple reader processes
- One writer process
- Each worker can be reader or writer
- Locks handled at file level

