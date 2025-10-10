## Issuance Service API

### Health Check

- **Endpoint:** `GET /health`
- **Description:** Returns basic service health and identifies the worker handling requests.
- **Query Params:** _None_
- **Request Body:** _None_
- **Success Response:**
	- **Status:** `200 OK`
	- **Body:**
		```json
		{
			"success": true,
			"message": "ok",
			"worker": "worker-example"
		}
		```

### Issue Credential

- **Endpoint:** `POST /api/issue`
- **Description:** Issues a new credential if one with the same deterministic signature has not been recorded yet.
- **Request Body (JSON):**
	```json
	{
		"name": "Alice Smith",
		"credentialType": "employee-id",
		"details": {
			"employeeId": "E123",
			"department": "Engineering"
		}
	}
	```
- **Validation Rules:**
	- `name`: trimmed non-empty string, max 255 characters
	- `credentialType`: trimmed non-empty string, max 255 characters
	- `details`: JSON object with at least one property (nested structure allowed)
- **Success Response:**
	- **Status:** `201 Created`
	- **Body:**
		```json
		{
			"success": true,
			"message": "credential issued by worker-example",
			"credential": {
				"id": "<sha256-hex>",
				"name": "Alice Smith",
				"credentialType": "employee-id",
				"details": {
					"employeeId": "E123",
					"department": "Engineering"
				},
				"issuedBy": "worker-example",
				"issuedAt": "2025-10-10T00:00:00.000Z",
				"hash": "<sha256-hex>"
			}
		}
		```
- **Conflict Response (duplicate credential):**
	- **Status:** `409 Conflict`
	- **Body:**
		```json
		{
			"success": false,
			"message": "Credential already issued"
		}
		```

### Custom Error Envelope

All custom errors returned by the service follow the shape below:

```json
{
	"success": false,
	"message": "<custom message>",
	"details": {"...": "optional structured data"}
}
```

Validation failures include an additional `errors` array describing field-specific issues.

### List Credentials (Internal Sync)

- **Endpoint:** `GET /internal/credentials`
- **Description:** Secure endpoint used by the verification service to fetch recently issued credentials.
- **Headers:**
	- `x-internal-sync-key: <secret>` (required when `SYNC_SECRET` is configured)
- **Query Params:**
	- `since` (optional ISO-8601 timestamp). When provided, only credentials with `issuedAt > since` are returned.
- **Success Response:**
	```json
	{
		"success": true,
		"count": 2,
		"data": [
			{
				"id": "<sha256-hex>",
				"name": "Alice Smith",
				"credentialType": "employee-id",
				"details": { "employeeId": "E123" },
				"issuedBy": "worker-issuer-01",
				"issuedAt": "2025-10-10T00:00:00.000Z",
				"hash": "<sha256-hex>"
			}
		]
	}
	```
- **Error Responses:**
	- `400` when `since` is not a valid ISO-8601 timestamp.
	- `401` when the sync secret is required but missing/incorrect.

## Verification Service API

### Health Check

- **Endpoint:** `GET /health`
- **Description:** Basic health probe identifying the verification worker instance.
- **Response:**
	```json
	{
		"success": true,
		"message": "ok",
		"worker": "worker-verifier-01"
	}
	```

### Verify Credential

- **Endpoint:** `POST /api/verify`
- **Description:** Validates a credential payload against the synchronized database entry.
- **Request Body (JSON):**
	```json
	{
		"id": "<sha256-hex>",
		"name": "Alice Smith",
		"credentialType": "employee-id",
		"details": {
			"employeeId": "E123",
			"department": "Engineering"
		},
		"issuedBy": "worker-issuer-01",
		"issuedAt": "2025-10-10T00:00:00.000Z",
		"hash": "<sha256-hex>"
	}
	```
- **Success Response:**
	```json
	{
		"valid": true,
		"message": "Credential verified successfully",
		"issuedBy": "worker-issuer-01",
		"issuedAt": "2025-10-10T00:00:00.000Z",
		"verifiedBy": "worker-verifier-01"
	}
	```
- **Invalid Credential (mismatch or missing):**
	```json
	{
		"valid": false,
		"message": "Credential data mismatch",
		"issuedBy": "worker-issuer-01",
		"issuedAt": "2025-10-10T00:00:00.000Z",
		"verifiedBy": "worker-verifier-01"
	}
	```
	When the credential ID does not exist, `issuedBy` and `issuedAt` will be `null` with a `message` of `Credential not found`.

### Synchronize Credential

- **Endpoint:** `POST /internal/sync`
- **Description:** Ingests credential data from the issuance service for local storage.
- **Headers:**
	- `Content-Type: application/json`
	- `x-internal-sync-key: <secret>` _(optional, required if `SYNC_SECRET` configured)_
- **Request Body:** Same structure as the verify request payload.
- **Success Response:**
	```json
	{
		"success": true,
		"message": "Credential synchronized successfully"
	}
	```
- **Failure Response:** Returns standard error envelope (e.g. `400 Invalid credential hash`, `401 Unauthorized sync request`).
