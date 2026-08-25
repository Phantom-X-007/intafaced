/**
 * Mass-cancel by owner. Owner is accountId — the field the book already has.
 * Session is not on the book; a session id refuses rather than inventing one.
 * Missing account cannot apply — the caller refuses. The engine does not invent an owner.
 */
import type { AccountId, OrderId } from './types.js';

export const SESSION_UNSUPPORTED = 'session_unsupported' as const;

export type MassCancelRefuse = typeof SESSION_UNSUPPORTED;

export interface LiveOwned {
  readonly orderId: OrderId;
  readonly accountId: AccountId;
  readonly sequence: number;
}

export function readSessionId(cmd: { readonly sessionId?: string | null }): string | null {
  const raw = cmd.sessionId;
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function massCancelSessionRefuse(sessionId: string | null): { readonly code: MassCancelRefuse; readonly message: string } | null {
  if (sessionId === null) return null;
  return {
    code: SESSION_UNSUPPORTED,
    message: 'session mass-cancel is unsupported; the engine does not invent a session',
  };
}

/** Live ids for this account, oldest sequence first. Missing account matches nothing. */
export function ownedOrderIds(accountId: AccountId, live: readonly LiveOwned[]): readonly OrderId[] {
  if (accountId.length === 0) return [];
  return live
    .filter((row) => row.accountId === accountId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((row) => row.orderId);
}
