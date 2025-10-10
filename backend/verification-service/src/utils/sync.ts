import { serviceConfig } from '../config';
import { AppError } from './errors';
import { credentialModel, type CredentialEntity } from '../models/credentialModel';
import { generateIntegrityHash } from './hash';

type FetchFn = typeof fetch;

interface IssuanceCredentialResponse {
  success: boolean;
  count: number;
  data: CredentialEntity[];
}

const resolveFetch = (): FetchFn => {
  if (typeof globalThis.fetch !== 'function') {
    throw new AppError('Fetch API is not available in this runtime', 500);
  }
  return globalThis.fetch.bind(globalThis);
};

const buildIssuanceCredentialsUrl = (since?: string): string => {
  const base = serviceConfig.issuanceServiceUrl;
  const url = new URL('/internal/credentials', base);
  if (since) {
    url.searchParams.set('since', since);
  }
  return url.toString();
};

const sanitizeIncomingCredential = (credential: CredentialEntity): CredentialEntity => {
  const { hash, ...rest } = credential;
  const expectedHash = generateIntegrityHash(rest);
  if (hash !== expectedHash) {
    throw new AppError(`Hash mismatch for credential ${credential.id}`, 400);
  }
  return credential;
};

export const fetchCredentialsFromIssuance = async (since?: string): Promise<CredentialEntity[]> => {
  const fetchFn = resolveFetch();
  const url = buildIssuanceCredentialsUrl(since);
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };

  if (serviceConfig.syncSecret) {
    headers['x-internal-sync-key'] = serviceConfig.syncSecret;
  }

  const response = await fetchFn(url, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AppError(
      body ? `Issuance sync failed with status ${response.status}: ${body}` : `Issuance sync failed with status ${response.status}`,
      response.status
    );
  }

  const payload = (await response.json()) as IssuanceCredentialResponse;

  if (!payload.success || !Array.isArray(payload.data)) {
    throw new AppError('Invalid response from issuance service', 502);
  }

  return payload.data.map(sanitizeIncomingCredential);
};

export const performCatchUpSync = async (): Promise<number> => {
  const latestIssuedAt = credentialModel.getLatestIssuedAt();
  const credentials = await fetchCredentialsFromIssuance(latestIssuedAt ?? undefined);

  if (credentials.length === 0) {
    return 0;
  }

  return credentialModel.upsertMany(credentials);
};
