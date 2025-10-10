# Kube Credential

Credential issuance and verification platform designed to run inside Kubernetes-friendly environments. The repository now ships both the **Issuance Service** (credential creation) and the **Verification Service** (integrity checks and lookup).

## Project Layout

```
backend/
	issuance-service/     # Credential issuer (Node.js + TypeScript)
	verification-service/ # Credential verifier (Node.js + TypeScript)
docs/                   # API documentation and design notes
frontend/               # React client (bootstrapped)
```

## 🛠 Tech Stack

- **Runtime:** Node.js 20
- **Language:** TypeScript (strict mode)
- **Framework:** Express.js (both services)
- **Database:** SQLite (embedded, via `better-sqlite3` with WAL mode)
- **Validation:** Zod
- **Testing:** Jest + Supertest
- **Containerization:** Docker (multi-stage build)

## Issuance Service (`backend/issuance-service`)

The issuance microservice is production-ready and ships with:

- Deterministic credential IDs based on SHA-256 hashing of the request body
- Integrity hashes persisted alongside each credential record
- Worker-aware responses using the `HOSTNAME` environment variable
- Input validation with descriptive error messages
- Zero-config embedded SQLite storage managed through `better-sqlite3`
- Automatic synchronization to the verification service with configurable retry logic
- Automated Jest test suite covering happy path, duplicate detection, and validation failures
- Dockerfile optimized for small production images

### Available Endpoints

See [`docs/apis.md`](docs/apis.md) for detailed request/response payloads and error envelopes. Highlights:

| Method | Endpoint              | Description                                                  |
|--------|-----------------------|--------------------------------------------------------------|
| GET    | `/health`             | Service liveness + worker info                               |
| POST   | `/api/issue`          | Issue credential, then sync to verification service          |
| GET    | `/internal/credentials` | Secure endpoint returning credentials issued after a timestamp |

### Scripts

| Command          | Description                          |
|------------------|--------------------------------------|
| `yarn dev`       | Start service with hot reload         |
| `yarn build`     | Compile TypeScript to `dist/`         |
| `yarn start`     | Run compiled service (post-build)     |
| `yarn test`      | Execute Jest unit tests               |

### Environment Variables

Create a `.env` file in `backend/issuance-service/` (see `.env.example` for reference).

| Variable         | Default           | Purpose                                        |
|------------------|-------------------|------------------------------------------------|
| `PORT`           | `3001`            | HTTP port for the Express server                |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed browser origins (`*` permits all) |
| `DATABASE_PATH`  | `data/credentials.db` | SQLite database location (supports `:memory:`) |
| `HOSTNAME`       | system hostname   | Worker identifier for responses                 |
| `VERIFICATION_SERVICE_URL` | `http://localhost:3002` | Base URL for verification service sync calls |
| `SYNC_SECRET`    | _(unset)_         | Optional shared secret sent on sync requests   |

### Local Development

```bash
cd backend/issuance-service
yarn install
yarn dev
```

Access the health endpoint at `http://localhost:3001/health`.

### Run Tests

```bash
cd backend/issuance-service
yarn test
```

### Docker Build

```bash
cd backend/issuance-service
docker build -t kube-credential/issuance-service .
docker run --rm -p 3001:3001 -v $(pwd)/data:/data kube-credential/issuance-service
```

## Verification Service (`backend/verification-service`)

The verification microservice maintains a synchronized credential store and validates incoming payloads for integrity.

- `/api/verify` endpoint checks for record existence and recomputes hashes before responding.
- `/internal/sync` endpoint ingests credentials from the issuance service (supports optional shared secret).
- On startup, the service downloads any credentials issued while it was offline, using a secure internal endpoint on the issuance service.
- Mirrored database schema (`credentials` table) using SQLite / WAL.
- Jest tests cover verification outcomes and sync validation.
- Multi-stage Dockerfile for lightweight container images.

Refer to [`backend/verification-service/README.md`](backend/verification-service/README.md) for usage details.

### Environment Variables

| Variable               | Default                | Purpose                                                                 |
|------------------------|------------------------|-------------------------------------------------------------------------|
| `PORT`                 | `3002`                 | HTTP port for Express                                                   |
| `DATABASE_PATH`        | `data/verification.db` | SQLite database location                                                |
| `HOSTNAME`             | `verification-service` | Worker identifier reported in responses                                 |
| `SYNC_SECRET`          | _(unset)_              | Optional shared secret required on `/internal/sync` calls               |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated list of allowed browser origins (`*` permits all)       |
| `ISSUANCE_SERVICE_URL` | `http://localhost:3001` | Base URL used for the startup catch-up sync with the issuance service |

### Run Tests

```bash
cd backend/verification-service
yarn test
```

## Docker Compose

Spin up both services (and persistent SQLite volumes) using the bundled compose file:

```bash
docker compose up --build
```

Environment variables such as `SYNC_SECRET` can be supplied via an `.env` file or inline when invoking Compose. Issuance service automatically targets the composed verification endpoint (`verification-service:3002`).

## Roadmap

- Wire services into the React frontend workflow
- Add authentication/authorization around issuance & verification endpoints
- Provide Helm charts / Kubernetes manifests for deployment

Contributions are welcome—open an issue or PR with ideas or improvements.
