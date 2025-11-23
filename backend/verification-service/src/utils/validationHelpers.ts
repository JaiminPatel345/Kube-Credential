import { z } from 'zod';

/**
 * Validates that a string is not null, undefined, empty, or only whitespace
 */
export const isValidNonEmptyString = (value: unknown): boolean => {
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * Validates that a key-value pair has both valid key and value
 */
export const isValidKeyValuePair = (key: unknown, value: unknown): boolean => {
  // Key must be a non-empty string
  if (!isValidNonEmptyString(key)) {
    return false;
  }
  
  // Value cannot be null, undefined, or empty string
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  // If value is a string, it must not be empty after trimming
  if (typeof value === 'string' && value.trim().length === 0) {
    return false;
  }
  
  return true;
};

/**
 * Creates a Zod schema for validating details object
 * Ensures all keys are non-empty strings and all values are non-null/non-empty
 * Also checks for duplicate keys
 */
export const createDetailsSchema = () => {
  return z
    .record(z.string(), z.any())
    .refine((value) => !Array.isArray(value), {
      message: 'Details must be a JSON object, not an array'
    })
    .superRefine((details, ctx) => {
      const entries = Object.entries(details ?? {});
      
      // Check for duplicate keys (case-insensitive and trimmed)
      const seenKeys = new Map<string, string>(); // normalized key -> original key
      entries.forEach(([rawKey]) => {
        const normalizedKey = rawKey.trim().toLowerCase();
        if (seenKeys.has(normalizedKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Duplicate key detected: "${rawKey}" (conflicts with "${seenKeys.get(normalizedKey)}")`,
            path: ['details', rawKey]
          });
        } else {
          seenKeys.set(normalizedKey, rawKey);
        }
      });

      entries.forEach(([rawKey, rawValue]) => {
        // Validate key is not empty
        if (!isValidNonEmptyString(rawKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Detail keys cannot be empty or contain only whitespace',
            path: ['details', rawKey]
          });
          return;
        }

        const key = rawKey.trim();

        // Validate value is not null, undefined, or empty
        if (rawValue === null || rawValue === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Detail value for "${key}" cannot be null or undefined`,
            path: ['details', rawKey]
          });
          return;
        }

        if (rawValue === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Detail value for "${key}" cannot be empty`,
            path: ['details', rawKey]
          });
          return;
        }

        // If value is a string, check it's not only whitespace
        if (typeof rawValue === 'string' && rawValue.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Detail value for "${key}" cannot be only whitespace`,
            path: ['details', rawKey]
          });
        }
      });
    });
};

/**
 * Creates a Zod schema for a required non-empty string field
 */
export const createRequiredStringSchema = (fieldName: string, maxLength: number = 255) => {
  return z
    .string({ required_error: `${fieldName} is required` })
    .trim()
    .min(1, { message: `${fieldName} is required` })
    .max(maxLength, { message: `${fieldName} must not exceed ${maxLength} characters` });
};

/**
 * Creates a Zod schema for date string validation (YYYY-MM-DD format)
 */
export const createISODateSchema = (fieldName: string = 'Date') => {
  return z
    .string({ required_error: `${fieldName} is required` })
    .trim()
    .min(1, { message: `${fieldName} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: `${fieldName} must be in YYYY-MM-DD format`
    })
    .refine((value: string) => !Number.isNaN(Date.parse(value)), {
      message: `${fieldName} must be a valid date`
    });
};

/**
 * Creates a Zod schema for hash validation (64 character hex string)
 */
export const createHashSchema = () => {
  return z
    .string({ required_error: 'Hash is required' })
    .trim()
    .min(1, { message: 'Hash is required' })
    .length(64, { message: 'Hash must be exactly 64 characters long' })
    .regex(/^[a-f0-9]{64}$/i, { message: 'Hash must be a valid hexadecimal string' });
};

/**
 * Validates a details object and returns validation errors
 */
export const validateDetails = (
  details: Record<string, unknown>
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {
      valid: false,
      errors: ['Details must be a valid object']
    };
  }

  const entries = Object.entries(details);
  
  // Check for duplicate keys (case-insensitive and trimmed)
  const seenKeys = new Map<string, string>(); // normalized key -> original key
  entries.forEach(([key]) => {
    const normalizedKey = key.trim().toLowerCase();
    if (seenKeys.has(normalizedKey)) {
      errors.push(`Duplicate key detected: "${key}" (conflicts with "${seenKeys.get(normalizedKey)}")`);
    } else {
      seenKeys.set(normalizedKey, key);
    }
  });

  entries.forEach(([key, value]) => {
    if (!isValidKeyValuePair(key, value)) {
      if (!isValidNonEmptyString(key)) {
        errors.push('Detail keys cannot be empty or contain only whitespace');
      } else if (value === null || value === undefined) {
        errors.push(`Detail value for "${key.trim()}" cannot be null or undefined`);
      } else if (value === '') {
        errors.push(`Detail value for "${key.trim()}" cannot be empty`);
      } else if (typeof value === 'string' && value.trim().length === 0) {
        errors.push(`Detail value for "${key.trim()}" cannot be only whitespace`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};
