/**
 * Drop all other drop-copy streams when a recovery code revokes the other sessions.
 * The recovered session's drop-copy stays. Refuse if the code is spent or missing.
 * Not a redo of recovery-drop-other-streams (private /private/stream)
 * or recovery-mint-key-revoke-stream (drop-copy key revoke).
 */
export class RecoveryCodeDropCopyStreamError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.recovery_missing' | 'auth.recovery_spent',
  ) {
    super(message);
    this.name = 'RecoveryCodeDropCopyStreamError';
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function recoveryCodeDropsOtherDropCopyStreams(input: { code?: unknown; recoveryCodeHashes?: unknown }): void {
  const trimmed = typeof input.code === 'string' ? input.code.trim() : '';
  if (!trimmed) {
    throw new RecoveryCodeDropCopyStreamError('Recovery code missing', 'auth.recovery_missing');
  }
  if (asStringList(input.recoveryCodeHashes).length === 0) {
    throw new RecoveryCodeDropCopyStreamError('Recovery code spent', 'auth.recovery_spent');
  }
}
