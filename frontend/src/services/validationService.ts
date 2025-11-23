import {
  isValidNonEmptyString,
  isValidISODate,
  isValidHash,
  validateDetails as validateDetailsUtil
} from '../utils/validation';

/**
 * Credential data structure for issuance
 */
export interface IssuanceCredentialData {
  name: string;
  credentialType: string;
  details: Record<string, unknown>;
}

/**
 * Credential data structure for verification
 */
export interface VerificationCredentialData extends IssuanceCredentialData {
  id: string;
  issuedBy: string;
  issuedAt: string;
  hash: string;
}

/**
 * Validation result with specific field errors
 */
export interface ValidationResult {
  valid: boolean;
  errors: {
    name?: string;
    credentialType?: string;
    details?: string;
    id?: string;
    issuedBy?: string;
    issuedAt?: string;
    hash?: string;
  };
}

/**
 * Parse and normalize JSON input
 */
export const parseCredentialJSON = (jsonString: string): {
  success: boolean;
  data?: any;
  error?: string;
} => {
  if (!jsonString.trim()) {
    return { success: false, error: 'JSON input is required' };
  }

  try {
    const parsed = JSON.parse(jsonString);
    
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { success: false, error: 'JSON must be a valid object' };
    }

    return { success: true, data: parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    return { success: false, error: `JSON parse error: ${message}` };
  }
};

/**
 * Normalize details from KeyValueEditor format to include empty keys
 * This preserves all data when switching modes
 */
export const normalizeDetailsFromKeyValue = (
  pairs: Record<string, string>
): Record<string, unknown> => {
  return { ...pairs };
};

/**
 * Convert details to KeyValueEditor format
 * Preserves all entries including those with empty keys/values for editing
 */
export const detailsToKeyValuePairs = (
  details: Record<string, unknown>
): Record<string, string> => {
  const pairs: Record<string, string> = {};
  
  Object.entries(details).forEach(([key, value]) => {
    pairs[key] = String(value ?? '');
  });
  
  return pairs;
};

/**
 * Validate issuance credential data
 */
export const validateIssuanceCredential = (
  data: Partial<IssuanceCredentialData>
): ValidationResult => {
  const errors: ValidationResult['errors'] = {};

  // Validate name
  if (!isValidNonEmptyString(data.name)) {
    errors.name = 'Name is required';
  }

  // Validate credential type
  if (!isValidNonEmptyString(data.credentialType)) {
    errors.credentialType = 'Credential Type is required';
  }

  // Validate details
  if (data.details) {
    const detailsValidation = validateDetailsUtil(data.details);
    if (!detailsValidation.valid && detailsValidation.errors.length > 0) {
      errors.details = detailsValidation.errors[0];
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Validate verification credential data
 */
export const validateVerificationCredential = (
  data: Partial<VerificationCredentialData>
): ValidationResult => {
  const errors: ValidationResult['errors'] = {};

  // Validate id
  if (!isValidNonEmptyString(data.id)) {
    errors.id = 'ID is required';
  }

  // Validate name
  if (!isValidNonEmptyString(data.name)) {
    errors.name = 'Name is required';
  }

  // Validate credential type
  if (!isValidNonEmptyString(data.credentialType)) {
    errors.credentialType = 'Credential Type is required';
  }

  // Validate issuedBy
  if (!isValidNonEmptyString(data.issuedBy)) {
    errors.issuedBy = 'Issued By is required';
  }

  // Validate issuedAt
  if (!isValidNonEmptyString(data.issuedAt)) {
    errors.issuedAt = 'Issued At is required';
  } else if (!isValidISODate(data.issuedAt!)) {
    errors.issuedAt = 'Issued At must be in YYYY-MM-DD format';
  }

  // Validate hash
  if (!isValidNonEmptyString(data.hash)) {
    errors.hash = 'Hash is required';
  } else if (!isValidHash(data.hash!)) {
    errors.hash = 'Hash must be a valid 64-character hexadecimal string';
  }

  // Validate details
  if (data.details) {
    const detailsValidation = validateDetailsUtil(data.details);
    if (!detailsValidation.valid && detailsValidation.errors.length > 0) {
      errors.details = detailsValidation.errors[0];
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Parse and validate issuance credential from JSON
 */
export const parseAndValidateIssuanceJSON = (jsonString: string): {
  valid: boolean;
  data?: IssuanceCredentialData;
  errors: ValidationResult['errors'];
} => {
  const parseResult = parseCredentialJSON(jsonString);
  
  if (!parseResult.success) {
    return {
      valid: false,
      errors: { details: parseResult.error }
    };
  }

  const parsed = parseResult.data;

  // Extract and normalize data
  const credentialData: Partial<IssuanceCredentialData> = {
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    credentialType: typeof parsed.credentialType === 'string' ? parsed.credentialType : undefined,
    details: parsed.details && typeof parsed.details === 'object' && !Array.isArray(parsed.details)
      ? parsed.details
      : undefined
  };

  const validation = validateIssuanceCredential(credentialData);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors
    };
  }

  return {
    valid: true,
    data: {
      name: credentialData.name!.trim(),
      credentialType: credentialData.credentialType!.trim(),
      details: credentialData.details || {}
    },
    errors: {}
  };
};

/**
 * Parse and validate verification credential from JSON
 */
export const parseAndValidateVerificationJSON = (jsonString: string): {
  valid: boolean;
  data?: VerificationCredentialData;
  errors: ValidationResult['errors'];
} => {
  const parseResult = parseCredentialJSON(jsonString);
  
  if (!parseResult.success) {
    return {
      valid: false,
      errors: { details: parseResult.error }
    };
  }

  const parsed = parseResult.data;

  // Extract and normalize data
  const credentialData: Partial<VerificationCredentialData> = {
    id: typeof parsed.id === 'string' ? parsed.id : undefined,
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    credentialType: typeof parsed.credentialType === 'string' ? parsed.credentialType : undefined,
    issuedBy: typeof parsed.issuedBy === 'string' ? parsed.issuedBy : undefined,
    issuedAt: typeof parsed.issuedAt === 'string' ? parsed.issuedAt : undefined,
    hash: typeof parsed.hash === 'string' ? parsed.hash : undefined,
    details: parsed.details && typeof parsed.details === 'object' && !Array.isArray(parsed.details)
      ? parsed.details
      : undefined
  };

  const validation = validateVerificationCredential(credentialData);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors
    };
  }

  return {
    valid: true,
    data: {
      id: credentialData.id!.trim(),
      name: credentialData.name!.trim(),
      credentialType: credentialData.credentialType!.trim(),
      issuedBy: credentialData.issuedBy!.trim(),
      issuedAt: credentialData.issuedAt!.trim(),
      hash: credentialData.hash!.trim(),
      details: credentialData.details || {}
    },
    errors: {}
  };
};

/**
 * Convert simple form data to normalized credential
 * Works for both modes - always converts to consistent format
 */
export const normalizeIssuanceFormData = (formData: {
  name: string;
  credentialType: string;
  details: Record<string, string>;
}): IssuanceCredentialData => {
  return {
    name: formData.name.trim(),
    credentialType: formData.credentialType.trim(),
    details: normalizeDetailsFromKeyValue(formData.details)
  };
};

/**
 * Convert simple form data to normalized credential for verification
 */
export const normalizeVerificationFormData = (formData: {
  id: string;
  name: string;
  credentialType: string;
  issuedBy: string;
  issuedAt: string;
  hash: string;
  details: Record<string, string>;
}): VerificationCredentialData => {
  return {
    id: formData.id.trim(),
    name: formData.name.trim(),
    credentialType: formData.credentialType.trim(),
    issuedBy: formData.issuedBy.trim(),
    issuedAt: formData.issuedAt.trim(),
    hash: formData.hash.trim(),
    details: normalizeDetailsFromKeyValue(formData.details)
  };
};
