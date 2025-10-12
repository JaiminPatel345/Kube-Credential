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

  async create(entity: CredentialEntity): Promise<CredentialEntity> {
    const pool = getPool();
    const result = await pool.query<CredentialRow>(
      `INSERT INTO credentials (id, name, credential_type, details, issued_by, issued_at, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING
         id,
         name,
         credential_type AS "credentialType",
         details,
         issued_by AS "issuedBy",
         issued_at AS "issuedAt",
         hash`,
      [
        entity.id,
        entity.name,
        entity.credentialType,
        entity.details,
        entity.issuedBy,
        entity.issuedAt,
        entity.hash
      ]
    );

    return mapRow(result.rows[0]);
  },

  async listIssuedAfter(issuedAfter?: string): Promise<CredentialEntity[]> {
    const pool = getPool();

    const result = issuedAfter
      ? await pool.query<CredentialRow>(
          `SELECT
             id,
             name,
             credential_type AS "credentialType",
             details,
             issued_by AS "issuedBy",
             issued_at AS "issuedAt",
             hash
           FROM credentials
           WHERE issued_at > $1
           ORDER BY issued_at ASC`,
          [issuedAfter]
        )
      : await pool.query<CredentialRow>(
          `SELECT
             id,
             name,
             credential_type AS "credentialType",
             details,
             issued_by AS "issuedBy",
             issued_at AS "issuedAt",
             hash
           FROM credentials
           ORDER BY issued_at ASC`
        );

    return result.rows.map(mapRow);
  }
};
