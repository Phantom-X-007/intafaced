/**
 * Open a private stream on the recovered session after a recovery redeem.
 * Refuse if the code is spent or missing.
 * Not a redo of drop-other-streams.
 */
export class RecoveryCodeOpenStreamError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.recovery_missing' | 'auth.recovery_spent',
  ) {
    super(message);
    this.name = 'RecoveryCodeOpenStreamError';
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function recoveryCodeOpensRecoveredStream(input: { code?: unknown; recoveryCodeHashes?: unknown }): void {
  const trimmed = typeof input.code === 'string' ? input.code.trim() : '';
  if (!trimmed) {
    throw new RecoveryCodeOpenStreamError('Recovery code missing', 'auth.recovery_missing');
  }
  if (asStringList(input.recoveryCodeHashes).length === 0) {
    throw new RecoveryCodeOpenStreamError('Recovery code spent', 'auth.recovery_spent');
  }
}
