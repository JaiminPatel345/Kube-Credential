import { CredentialEntity } from '../models/credentialModel';
import { serviceConfig } from '../config';

const MAX_SYNC_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const buildSyncUrl = (): string => {
  const base = serviceConfig.verificationServiceUrl;
  try {
    const url = new URL('/internal/sync', base);
    return url.toString();
  } catch (_error) {
    return `${base.replace(/\/?$/, '')}/internal/sync`;
  }
};

export const syncCredentialWithVerificationService = async (credential: CredentialEntity): Promise<void> => {
  const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;

  if (!fetchFn) {
    // eslint-disable-next-line no-console
    console.error('Verification sync skipped: fetch API is not available in this runtime');
    return;
  }

  const endpoint = buildSyncUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (serviceConfig.syncSecret) {
    headers['x-internal-sync-key'] = serviceConfig.syncSecret;
  }

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < MAX_SYNC_ATTEMPTS) {
    attempt += 1;
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(credential)
      });

      if (response.ok) {
        return;
      }

      const responseText = await response.text().catch(() => '');
      throw new Error(
        responseText
          ? `Verification sync failed with status ${response.status}: ${responseText}`
          : `Verification sync failed with status ${response.status}`
      );
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_SYNC_ATTEMPTS) {
        break;
      }

      await sleep(BASE_RETRY_DELAY_MS * attempt);
    }
  }

  // eslint-disable-next-line no-console
  console.error('Failed to sync credential with verification service', {
    credentialId: credential.id,
    attempts: MAX_SYNC_ATTEMPTS,
    error:
      lastError instanceof Error
        ? {
            name: lastError.name,
            message: lastError.message
          }
        : lastError
  });
};
