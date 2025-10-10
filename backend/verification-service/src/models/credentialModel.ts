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

  upsert(entity: CredentialEntity): CredentialEntity {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash)
       VALUES (@id, @name, @credentialType, @details, @issuedBy, @issuedAt, @hash)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         credentialType = excluded.credentialType,
         details = excluded.details,
         issuedBy = excluded.issuedBy,
         issuedAt = excluded.issuedAt,
         hash = excluded.hash`
    ).run({
      ...entity,
      details: JSON.stringify(entity.details)
    });

    return { ...entity };
  },

  upsertMany(entities: CredentialEntity[]): number {
    if (entities.length === 0) {
      return 0;
    }

    const db = getDatabase();
    const statement = db.prepare(
      `INSERT INTO credentials (id, name, credentialType, details, issuedBy, issuedAt, hash)
       VALUES (@id, @name, @credentialType, @details, @issuedBy, @issuedAt, @hash)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         credentialType = excluded.credentialType,
         details = excluded.details,
         issuedBy = excluded.issuedBy,
         issuedAt = excluded.issuedAt,
         hash = excluded.hash`
    );

    const transaction = db.transaction((rows: CredentialEntity[]) => {
      for (const entity of rows) {
        statement.run({ ...entity, details: JSON.stringify(entity.details) });
      }
    });

    transaction(entities);

    return entities.length;
  },

  getLatestIssuedAt(): string | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT issuedAt FROM credentials ORDER BY issuedAt DESC LIMIT 1')
      .get() as { issuedAt: string } | undefined;
    return row?.issuedAt ?? null;
  }
};
