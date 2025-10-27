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
 * Validates a details object (Record<string, unknown>)
 * Returns validation result with errors if any
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

  entries.forEach(([key, value]) => {
    if (!isValidKeyValuePair(key, value)) {
      if (!isValidNonEmptyString(key)) {
        // Check if there's a value - if so, give specific error message
        if (value !== null && value !== undefined && value !== '') {
          const displayValue = typeof value === 'string' && value.length > 30 
            ? `${value.substring(0, 30)}...` 
            : String(value);
          errors.push(`Key for value "${displayValue}" cannot be empty or contain only whitespace`);
        } else {
          errors.push('Detail keys cannot be empty or contain only whitespace');
        }
      } else if (value === null || value === undefined) {
        errors.push(`Detail value for key "${key.trim()}" cannot be null or undefined`);
      } else if (value === '') {
        errors.push(`Detail value for key "${key.trim()}" cannot be empty`);
      } else if (typeof value === 'string' && value.trim().length === 0) {
        errors.push(`Detail value for key "${key.trim()}" cannot be only whitespace`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Validates an ISO date string
 */
export const isValidISODate = (dateString: string): boolean => {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

/**
 * Validates a hash string (64 character hex string)
 */
export const isValidHash = (hash: string): boolean => {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  
  return /^[a-f0-9]{64}$/i.test(hash);
};

/**
 * Validates required credential fields
 */
export interface CredentialValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export const validateCredentialFields = (data: {
  id?: string;
  name?: string;
  credentialType?: string;
  issuedBy?: string;
  issuedAt?: string;
  hash?: string;
  details?: Record<string, unknown>;
}): CredentialValidationResult => {
  const errors: Record<string, string> = {};

  // Validate required fields
  if (!isValidNonEmptyString(data.id)) {
    errors.id = 'Id is required';
  }

  if (!isValidNonEmptyString(data.name)) {
    errors.name = 'Name is required';
  }

  if (!isValidNonEmptyString(data.credentialType)) {
    errors.credentialType = 'Credential Type is required';
  }

  if (!isValidNonEmptyString(data.issuedBy)) {
    errors.issuedBy = 'Issued By is required';
  }

  if (!isValidNonEmptyString(data.issuedAt)) {
    errors.issuedAt = 'Issued At is required';
  } else if (!isValidISODate(data.issuedAt!)) {
    errors.issuedAt = 'Issued At must be a valid ISO date string';
  }

  if (!isValidNonEmptyString(data.hash)) {
    errors.hash = 'Hash is required';
  } else if (!isValidHash(data.hash!)) {
    errors.hash = 'Hash must be a valid 64-character hexadecimal string';
  }

  // Validate details if provided
  if (data.details) {
    const detailsValidation = validateDetails(data.details);
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
 * Validates issuance form fields
 */
export const validateIssuanceFields = (data: {
  name?: string;
  credentialType?: string;
  details?: Record<string, unknown>;
}): CredentialValidationResult => {
  const errors: Record<string, string> = {};

  if (!isValidNonEmptyString(data.name)) {
    errors.name = 'Name is required';
  }

  if (!isValidNonEmptyString(data.credentialType)) {
    errors.credentialType = 'Credential Type is required';
  }

  // Validate details if provided
  if (data.details) {
    const detailsValidation = validateDetails(data.details);
    if (!detailsValidation.valid && detailsValidation.errors.length > 0) {
      errors.details = detailsValidation.errors[0];
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};
