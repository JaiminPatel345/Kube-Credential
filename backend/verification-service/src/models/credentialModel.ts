import { getPool } from '../utils/database';

export interface CredentialEntity {
  id: string;
  name: string;
  credentialType: string;
  details: Record<string, unknown>;
  issuedBy: string;
  issuedAt: string;
  hash: string;
}

type CredentialRow = {
  id: string;
  name: string;
  credentialType: string;
  details: Record<string, unknown>;
  issuedBy: string;
  issuedAt: string | Date;
  hash: string;
};

const mapRow = (row: CredentialRow): CredentialEntity => ({
  id: row.id,
  name: row.name,
  credentialType: row.credentialType,
  details: row.details,
  issuedBy: row.issuedBy,
  issuedAt: row.issuedAt instanceof Date ? row.issuedAt.toISOString() : new Date(row.issuedAt).toISOString(),
  hash: row.hash
});

const UPSERT_SQL = `
  INSERT INTO credentials (id, name, credential_type, details, issued_by, issued_at, hash)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    credential_type = excluded.credential_type,
    details = excluded.details,
    issued_by = excluded.issued_by,
    issued_at = excluded.issued_at,
    hash = excluded.hash
  RETURNING
    id,
    name,
    credential_type AS "credentialType",
    details,
    issued_by AS "issuedBy",
    issued_at AS "issuedAt",
    hash
`;

export const credentialModel = {
  async findById(id: string): Promise<CredentialEntity | null> {
    const pool = getPool();
    const result = await pool.query<CredentialRow>(
      `SELECT
         id,
         name,
         credential_type AS "credentialType",
         details,
         issued_by AS "issuedBy",
         issued_at AS "issuedAt",
         hash
       FROM credentials
       WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];
    return row ? mapRow(row) : null;
  },

  async upsert(entity: CredentialEntity): Promise<CredentialEntity> {
    const pool = getPool();
    const result = await pool.query<CredentialRow>(UPSERT_SQL, [
      entity.id,
      entity.name,
      entity.credentialType,
      entity.details,
      entity.issuedBy,
      entity.issuedAt,
      entity.hash
    ]);

    return mapRow(result.rows[0]);
  },

  async upsertMany(entities: CredentialEntity[]): Promise<number> {
    if (entities.length === 0) {
      return 0;
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const entity of entities) {
        await client.query(UPSERT_SQL, [
          entity.id,
          entity.name,
          entity.credentialType,
          entity.details,
          entity.issuedBy,
          entity.issuedAt,
          entity.hash
        ]);
      }

      await client.query('COMMIT');
      return entities.length;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getLatestIssuedAt(): Promise<string | null> {
    const pool = getPool();
    const result = await pool.query<{ issuedAt: string | Date }>(
      `SELECT issued_at AS "issuedAt"
       FROM credentials
       ORDER BY issued_at DESC
       LIMIT 1`
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return row.issuedAt instanceof Date ? row.issuedAt.toISOString() : new Date(row.issuedAt).toISOString();
  }
};
