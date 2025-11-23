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
 * Detects duplicate keys in a raw JSON string BEFORE JavaScript parses it
 * This is the only way to detect duplicates in JSON since JSON.parse() silently merges them
 */
export const detectDuplicateKeysInRawJson = (
  jsonString: string
): { hasDuplicates: boolean; duplicates: Array<{ key: string; values: string[] }> } => {
  try {
    // Use a regex to extract all key-value pairs from the details object
    // This regex matches "key": "value" or "key": value patterns
    const detailsMatch = jsonString.match(/"details"\s*:\s*\{([^}]*)\}/s);
    if (!detailsMatch) {
      return { hasDuplicates: false, duplicates: [] };
    }
    
    const detailsContent = detailsMatch[1];
    
    // Extract all keys from the details object
    // Match patterns like "key": with optional whitespace
    const keyMatches = detailsContent.matchAll(/"([^"]+)"\s*:/g);
    const keys: string[] = [];
    
    for (const match of keyMatches) {
      keys.push(match[1]);
    }
    
    // Group keys by normalized version (case-insensitive, trimmed)
    const keyGroups = new Map<string, string[]>();
    keys.forEach(key => {
      const normalizedKey = key.trim().toLowerCase();
      if (!keyGroups.has(normalizedKey)) {
        keyGroups.set(normalizedKey, []);
      }
      keyGroups.get(normalizedKey)!.push(key);
    });
    
    // Find duplicates
    const duplicates: Array<{ key: string; values: string[] }> = [];
    keyGroups.forEach((group) => {
      if (group.length > 1) {
        // Use the last key (which JavaScript will keep)
        const lastKey = group[group.length - 1];
        duplicates.push({
          key: lastKey,
          values: group.slice(0, -1).map(k => `"${k}"`)
        });
      }
    });
    
    return {
      hasDuplicates: duplicates.length > 0,
      duplicates
    };
  } catch {
    return { hasDuplicates: false, duplicates: [] };
  }
};

/**
 * Detects duplicate keys in an array of key-value pairs (before they become a JS object)
 */
export const detectDuplicateKeysInArray = (
  pairs: Array<{ key: string; value: string }>
): { hasDuplicates: boolean; duplicates: Array<{ key: string; values: string[] }> } => {
  const keyGroups = new Map<string, Array<{ originalKey: string; value: string }>>();
  
  // Group keys by normalized version
  pairs.forEach(({ key, value }) => {
    if (!key.trim()) return; // Skip empty keys
    
    const normalizedKey = key.trim().toLowerCase();
    if (!keyGroups.has(normalizedKey)) {
      keyGroups.set(normalizedKey, []);
    }
    keyGroups.get(normalizedKey)!.push({ originalKey: key, value });
  });
  
  // Find duplicates
  const duplicates: Array<{ key: string; values: string[] }> = [];
  keyGroups.forEach((group) => {
    if (group.length > 1) {
      // Use the last key (which will be kept)
      const lastEntry = group[group.length - 1];
      duplicates.push({
        key: lastEntry.originalKey,
        values: group.map(g => `"${g.originalKey}": "${g.value}"`).slice(0, -1) // Exclude the last one
      });
    }
  });
  
  return {
    hasDuplicates: duplicates.length > 0,
    duplicates
  };
};

/**
 * Detects duplicate keys in details object and returns information about them
 */
export const detectDuplicateKeys = (
  details: Record<string, string>
): { hasDuplicates: boolean; duplicates: Array<{ key: string; values: string[] }> } => {
  const entries = Object.entries(details);
  const keyGroups = new Map<string, Array<{ originalKey: string; value: string }>>();
  
  // Group keys by normalized version
  entries.forEach(([key, value]) => {
    const normalizedKey = key.trim().toLowerCase();
    if (!keyGroups.has(normalizedKey)) {
      keyGroups.set(normalizedKey, []);
    }
    keyGroups.get(normalizedKey)!.push({ originalKey: key, value });
  });
  
  // Find duplicates
  const duplicates: Array<{ key: string; values: string[] }> = [];
  keyGroups.forEach((group) => {
    if (group.length > 1) {
      // Use the last key (which will be kept)
      const lastEntry = group[group.length - 1];
      duplicates.push({
        key: lastEntry.originalKey,
        values: group.map(g => `"${g.originalKey}": "${g.value}"`).slice(0, -1) // Exclude the last one
      });
    }
  });
  
  return {
    hasDuplicates: duplicates.length > 0,
    duplicates
  };
};

/**
 * Removes duplicate keys keeping only the last occurrence (case-insensitive)
 */
export const removeDuplicateKeys = (
  details: Record<string, string>
): Record<string, string> => {
  const result: Record<string, string> = {};
  const normalizedToOriginal = new Map<string, string>();
  
  // Process entries in order, each new duplicate will override the previous
  Object.entries(details).forEach(([key, value]) => {
    const normalizedKey = key.trim().toLowerCase();
    
    // If we've seen this normalized key before, remove the old entry
    if (normalizedToOriginal.has(normalizedKey)) {
      const oldKey = normalizedToOriginal.get(normalizedKey)!;
      delete result[oldKey];
    }
    
    // Add/update with current key
    result[key] = value;
    normalizedToOriginal.set(normalizedKey, key);
  });
  
  return result;
};

/**
 * Validates a date string in YYYY-MM-DD format
 */
export const isValidISODate = (dateString: string): boolean => {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  
  // Check format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
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
    errors.issuedAt = 'Issued At must be in YYYY-MM-DD format';
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
