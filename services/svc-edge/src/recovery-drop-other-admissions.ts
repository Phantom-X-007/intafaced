/**
 * Drop all other private admissions when a recovery code revokes the other sessions.
 * The recovered session stays admitted. Refuse if the code is spent or missing.
 * Not a redo of drop-other-streams.
 */
export class RecoveryCodeAdmissionError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.recovery_missing' | 'auth.recovery_spent',
  ) {
    super(message);
    this.name = 'RecoveryCodeAdmissionError';
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function recoveryCodeDropsOtherAdmissions(input: { code?: unknown; recoveryCodeHashes?: unknown }): void {
  const trimmed = typeof input.code === 'string' ? input.code.trim() : '';
  if (!trimmed) {
    throw new RecoveryCodeAdmissionError('Recovery code missing', 'auth.recovery_missing');
  }
  if (asStringList(input.recoveryCodeHashes).length === 0) {
    throw new RecoveryCodeAdmissionError('Recovery code spent', 'auth.recovery_spent');
  }
}
