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
