import type { HaltState, SyncFailure } from './indexer.js';
import { userCopy } from './user-copy.js';

/**
 * lastError codes that make a served book a lie about live chain state.
 *
 * Halt is a separate door (`Indexer.halted`). These are the pass-failures
 * where the cursor is frozen for a named reason and the last projection
 * must not be rendered as current:
 *
 *   · chain-door (D26-P1-I3) — RPC/venue/id we cannot trust
 *   · startHeight — empty store that would look like "no orders"
 *
 * Transient mid-read races (`indexer.parent_unlink`) stay off this list:
 * the last canonical projection is still the last block we actually read.
 */
export const SERVING_REFUSE_CODES = new Set([
  'indexer.chain_not_configured',
  'indexer.chain_unreachable',
  'indexer.chain_id_mismatch',
  'indexer.venue_not_deployed',
  'indexer.malformed_block',
  'indexer.start_height_above_tip',
  'indexer.start_height_unavailable',
]);

export function lastErrorRefusesServing(failure: SyncFailure | null | undefined): failure is SyncFailure & { code: string } {
  return Boolean(failure?.code && SERVING_REFUSE_CODES.has(failure.code));
}

/** Public/read-model refuse copy for data-path 503s. Goes through i18n (missing → dotted name). */
export function lastErrorServingReason(failure: SyncFailure & { code: string }): string {
  return userCopy(failure.code);
}

export function haltServingReason(_halt: HaltState): string {
  return userCopy('indexer.halted');
}

/**
 * Boot with no RPC (`NullChainSource`, `chainSource: 'null'`). Sync idles as
 * `no-chain` and never writes lastError, so the serving-refuse set above
 * cannot see it. An empty book / null position would read as "no orders" /
 * "flat holding" — a silent zero. Name the absence instead.
 */
export function chainSourceRefusesServing(chainSource: string): boolean {
  return chainSource === 'null';
}

export function nullChainServingReason(): string {
  return userCopy('indexer.chain_not_configured');
}
