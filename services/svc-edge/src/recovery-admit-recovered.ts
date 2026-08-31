/**
 * Admit the recovered session after a recovery redeem.
 * Refuse if the code is spent or missing.
 * Not a redo of drop-other-admissions or open-recovered-stream.
 */
export class RecoveryCodeAdmitError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.recovery_missing' | 'auth.recovery_spent',
  ) {
    super(message);
    this.name = 'RecoveryCodeAdmitError';
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function recoveryCodeAdmitsRecoveredSession(input: { code?: unknown; recoveryCodeHashes?: unknown }): void {
  const trimmed = typeof input.code === 'string' ? input.code.trim() : '';
  if (!trimmed) {
    throw new RecoveryCodeAdmitError('Recovery code missing', 'auth.recovery_missing');
  }
  if (asStringList(input.recoveryCodeHashes).length === 0) {
    throw new RecoveryCodeAdmitError('Recovery code spent', 'auth.recovery_spent');
  }
}
