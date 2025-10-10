import { getDatabase } from '../utils/database';

export interface CredentialEntity {
  id: string;
  name: string;
  credentialType: string;
  details: Record<string, unknown>;
  issuedBy: string;
  issuedAt: string;
  hash: string;
}

type CredentialRow = Omit<CredentialEntity, 'details'> & { details: string };

const mapRow = (row: CredentialRow): CredentialEntity => ({
  ...row,
  details: JSON.parse(row.details) as Record<string, unknown>
});

export const credentialModel = {
  findById(id: string): CredentialEntity | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT id, name, credentialType, details, issuedBy, issuedAt, hash FROM credentials WHERE id = ?')
      .get(id) as CredentialRow | undefined;
    return row ? mapRow(row) : null;
  },

  create(entity: CredentialEntity): CredentialEntity {
    const db = getDatabase();
    db.prepare(
      'INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(
      entity.id,
      entity.name,
      entity.credentialType,
      JSON.stringify(entity.details),
      entity.issuedBy,
      entity.issuedAt,
      entity.hash
    );
    return { ...entity };
  }
};
