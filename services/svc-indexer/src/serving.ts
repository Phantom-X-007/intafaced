import type { HaltState, SyncFailure } from './indexer.js';

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

/** Operator-facing reason for `/ready` and data-path 503s. Halt keeps its own wording. */
export function lastErrorServingReason(failure: SyncFailure & { code: string }): string {
  return `Indexer will not serve projected books as live (${failure.code}). ${failure.message}`;
}

export function haltServingReason(halt: HaltState): string {
  return `Indexer halted — projection is known wrong and will not serve data until re-indexed. ${halt.reason}`;
}
