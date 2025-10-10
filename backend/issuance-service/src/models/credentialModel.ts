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
  async findById(id: string): Promise<CredentialEntity | null> {
    const db = await getDatabase();
    const row = await db.get<CredentialRow>(
      'SELECT id, name, credentialType, details, issuedBy, issuedAt, hash FROM credentials WHERE id = ?',
      id
    );
    return row ? mapRow(row) : null;
  },

  async create(entity: CredentialEntity): Promise<CredentialEntity> {
    const db = await getDatabase();
    await db.run(
      'INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
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
