/**
 * Identity `users.status` on `/private/stream` and `/drop-copy/stream`.
 * Frozen/closed refuse. Active proceeds. Missing status is not live — never invent active.
 * Read from identity account state. No second store.
 */

export type UserStatus = 'active' | 'frozen' | 'closed';

export class UserStatusError extends Error {
  constructor(
    message: string,
    readonly code: 'auth.account_frozen',
  ) {
    super(message);
    this.name = 'UserStatusError';
  }
}

/** Identity body only. Never invent `active`. */
export function optionalUserStatus(value: unknown): UserStatus | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const status = value.trim();
  if (status === 'active' || status === 'frozen' || status === 'closed') return status;
  return undefined;
}

export function optionalUserStatusFromBody(body: unknown): UserStatus | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const rec = body as Record<string, unknown>;
  return optionalUserStatus(rec.status);
}

/** Active stays open. Frozen, closed, missing, and junk refuse. */
export function userIsActive(status: string | null | undefined): boolean {
  return optionalUserStatus(status) === 'active';
}

export function assertUserActive(status: string | null | undefined): void {
  if (userIsActive(status)) return;
  const named = optionalUserStatus(status);
  throw new UserStatusError(`Account is ${named ?? 'frozen'}`, 'auth.account_frozen');
}
