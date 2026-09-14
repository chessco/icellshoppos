export interface IntakeValidationResult {
  valid: boolean;
  missingFields: string[];
}

export class IntakeValidationService {
  validateRequired(fields: Record<string, string | undefined>, requiredKeys: string[]): IntakeValidationResult {
    const missing: string[] = [];
    for (const key of requiredKeys) {
      const val = fields[key];
      if (!val || !val.trim()) {
        missing.push(key);
      }
    }
    return {
      valid: missing.length === 0,
      missingFields: missing,
    };
  }
}
