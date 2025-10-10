# Kube Credential

Credential issuance and verification platform designed to run inside Kubernetes-friendly environments. This repository currently focuses on the backend **Issuance Service** that generates tamper-evident credentials.

## Project Layout

```
backend/
	issuance-service/   # Node.js + TypeScript microservice implemented in this repo
docs/                 # API documentation and design notes
frontend/             # React client (bootstrapped, not yet wired to issuance API)
```

## 🛠 Tech Stack

- **Runtime:** Node.js 20
- **Language:** TypeScript (strict mode)
- **Framework:** Express.js
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
- Automated Jest test suite covering happy path, duplicate detection, and validation failures
- Dockerfile optimized for small production images

### Available Endpoints

See [`docs/apis.md`](docs/apis.md) for detailed request/response payloads and error envelopes. Highlights:

| Method | Endpoint       | Description                     |
|--------|----------------|---------------------------------|
| GET    | `/health`      | Service liveness + worker info  |
| POST   | `/api/issue`   | Issue credential if unique      |

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
| `DATABASE_PATH`  | `data/credentials.db` | SQLite database location (supports `:memory:`) |
| `HOSTNAME`       | system hostname   | Worker identifier for responses                 |

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

## Roadmap

- Wire issuance-service into the React frontend
- Add verification microservice and cross-service communication
- Provide Helm charts / Kubernetes manifests for deployment

Contributions are welcome—open an issue or PR with ideas or improvements.
