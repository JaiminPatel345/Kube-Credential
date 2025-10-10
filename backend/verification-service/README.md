# Verification Service

The verification microservice validates credentials issued by the companion issuance service. It stores a synchronized copy of credential data and performs strict hash verification to ensure payload integrity.

## Features

- Express.js API written in TypeScript with strict runtime validation
- Embedded SQLite database (via `better-sqlite3`) using WAL mode
- `/api/verify` endpoint compares incoming credential payloads against synchronized records
- `/internal/sync` endpoint ingests new credentials from the issuance service (optional shared secret)
- Comprehensive Jest test suite for verification and synchronization flows
- Multi-stage Dockerfile for lightweight production images

## Getting Started

```bash
cd backend/verification-service
yarn install
cp .env.example .env
# Adjust PORT / DATABASE_PATH / HOSTNAME / SYNC_SECRET as needed
yarn dev
```

The service listens on port `3002` by default. Health check is available at `GET /health`.

## Environment Variables

| Variable               | Default                     | Purpose                                                                 |
|------------------------|-----------------------------|-------------------------------------------------------------------------|
| `PORT`                 | `3002`                      | HTTP port for the Express server                                        |
| `DATABASE_PATH`        | `data/verification.db`      | SQLite database location (supports `:memory:`)                          |
| `HOSTNAME`             | `verification-service`      | Worker identifier used in responses                                     |
| `SYNC_SECRET`          | _(unset)_                   | Optional shared secret required on `/internal/sync` requests            |
| `ISSUANCE_SERVICE_URL` | `http://localhost:3001`     | Base URL used for catch-up sync when downloading credentials on startup |

## Scripts

| Command      | Description                               |
|--------------|-------------------------------------------|
| `yarn dev`   | Start service with hot reload              |
| `yarn build` | Compile TypeScript to `dist/`              |
| `yarn start` | Run compiled service from `dist/`          |
| `yarn test`  | Execute Jest test suite                    |

## Docker

```bash
cd backend/verification-service
docker build -t kube-credential/verification-service .
docker run --rm -p 3002:3002 -v $(pwd)/data:/data kube-credential/verification-service
```

Ensure the issuance service is configured with the same `SYNC_SECRET` and points `VERIFICATION_SERVICE_URL` to this service for automatic synchronization.

On startup the verification service queries the issuance service for any credentials issued since the last known record, ensuring downtime gaps are automatically filled.
