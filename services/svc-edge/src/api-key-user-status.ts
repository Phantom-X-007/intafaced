/**
 * Identity user status at the edge session door (M17 / M01).
 * Frozen or closed cannot open a session. Missing status stays open.
 * Never invent a freeze — identity exchange body only.
 */

export type IdentityUserStatus = 'active' | 'frozen' | 'closed';

export class KeyUserStatusError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.account_frozen',
  ) {
    super(message);
    this.name = 'KeyUserStatusError';
  }
}

const STATUSES = new Set<IdentityUserStatus>(['active', 'frozen', 'closed']);

/** Identity / exchange body only. Never invent a freeze. */
export function optionalUserStatus(body: unknown): IdentityUserStatus | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  const raw = rec.status ?? rec.userStatus ?? rec.user_status;
  if (typeof raw !== 'string') return undefined;
  const status = raw.trim().toLowerCase();
  if (!STATUSES.has(status as IdentityUserStatus)) return undefined;
  return status as IdentityUserStatus;
}

/** Walk a tRPC envelope or a bare body. Never invent a freeze. */
export function optionalUserStatusFromExchange(body: unknown): IdentityUserStatus | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const envelope = body as {
    result?: { data?: { json?: unknown; status?: unknown; userStatus?: unknown; user_status?: unknown } };
    status?: unknown;
    userStatus?: unknown;
    user_status?: unknown;
  };
  const data = envelope.result?.data?.json ?? envelope.result?.data ?? body;
  return optionalUserStatus(data);
}

/** Frozen or closed cannot open a session. Missing / active stay open. */
export function userStatusFrozen(status: string | null | undefined): boolean {
  const value = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return value === 'frozen' || value === 'closed';
}

export function assertUserNotFrozen(status: string | null | undefined): void {
  if (userStatusFrozen(status)) {
    throw new KeyUserStatusError('Account is frozen', 'auth.account_frozen');
  }
}
