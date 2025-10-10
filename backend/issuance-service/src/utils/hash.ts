import crypto from 'crypto';

export type CanonicalValue = string | number | boolean | null | CanonicalValue[] | { [key: string]: CanonicalValue };

const normalizeValue = (input: unknown): CanonicalValue => {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'bigint') {
    return input.toString();
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (Buffer.isBuffer(input)) {
    return input.toString('base64');
  }

  if (Array.isArray(input)) {
    return input.map((item) => normalizeValue(item));
  }

  if (input instanceof Map) {
    const sortedEntries = Array.from(input.entries()).sort(([keyA], [keyB]) =>
      keyA.toString().localeCompare(keyB.toString())
    );
    return sortedEntries.map(([key, value]) => [normalizeValue(key), normalizeValue(value)]);
  }

  if (input instanceof Set) {
    const sortedValues = Array.from(input.values()).sort();
    return sortedValues.map((value) => normalizeValue(value));
  }

  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

    return entries.reduce<Record<string, CanonicalValue>>((acc, [key, value]) => {
      acc[key] = normalizeValue(value);
      return acc;
    }, {});
  }

  return String(input);
};

export const canonicalize = (input: unknown): string => JSON.stringify(normalizeValue(input));

export const sha256 = (content: string): string =>
  crypto.createHash('sha256').update(content).digest('hex');

export const generateDeterministicId = (input: unknown): string => sha256(canonicalize(input));

export const generateIntegrityHash = (input: unknown): string => sha256(canonicalize(input));
