/**
 * P2P escrow × dispute law (ADR 2026-08-04 / D-S-08) — recipe-layer guards.
 *
 * Custodial escrow value moves only through `escrowLock` / `escrowRelease` /
 * `escrowRefund`. Service code already refuses machine adjudication; these
 * helpers make the same rule enforceable on the money post itself when a
 * caller marks the disposition as a dispute ruling.
 *
 * Escalate-and-hold is intentionally a ledger no-op: the timer may never
 * dispose of value. Disposition posts that claim a dispute outcome must name
 * a natural person (lowercase canonical UUID) — never `system:*` / timeout.
 */

import { InvalidEntryError } from '../types.js';

/** Same identifier space as svc-p2p `NATURAL_PERSON_ID` / ledger §4.2 user ids. */
export const NATURAL_PERSON_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isNaturalPersonId(id: string | null | undefined): boolean {
  return typeof id === 'string' && NATURAL_PERSON_ID.test(id);
}

/** Machine / timer spellings that previously disposed of disputed escrow. */
const FORBIDDEN_MACHINE_RESOLUTION = /^(system:|timer:|timeout$|backstop$|auto(?:-refund)?$|automation:)/i;

export interface EscrowDisputeRuling {
  /** Open dispute row id — presence means this post is a moderated disposition. */
  disputeId: string;
  /** Moderator who ruled — must be a natural-person UUID. */
  rulingBy: string;
  /** Optional reviewable notes (mirrored into ledger meta only). */
  notes?: string;
}

/**
 * When `ruling` is omitted, happy-path seller confirm / cancel stays unchanged.
 * When present, both disputeId and rulingBy are required and rulingBy must be
 * a person — an allowlist, not a `system:%` denylist (ADR refuse table).
 */
export function assertEscrowDisputeRuling(ruling: EscrowDisputeRuling | undefined, context: string): void {
  if (ruling === undefined) return;

  const disputeId = ruling.disputeId?.trim() ?? '';
  if (!disputeId) {
    throw new InvalidEntryError(`${context}: disputeId is required for a dispute disposition`);
  }

  const rulingBy = ruling.rulingBy?.trim() ?? '';
  if (!rulingBy) {
    throw new InvalidEntryError(`${context}: rulingBy is required for a dispute disposition`);
  }
  if (!isNaturalPersonId(rulingBy)) {
    throw new InvalidEntryError(
      `${context}: a timer or system actor cannot dispose of disputed escrow — rulingBy must be a lowercase canonical UUID`,
    );
  }
}

/**
 * Refund `resolution` strings that encode machine adjudication are refused even
 * without a `ruling` object — so a reintroduced backstop cannot hide as
 * `resolution: 'system:p2p-backstop'` on the happy-path refund recipe.
 */
export function assertEscrowRefundResolution(resolution: string | undefined, context: string): void {
  if (resolution === undefined) return;
  const value = resolution.trim();
  if (!value) return;
  if (FORBIDDEN_MACHINE_RESOLUTION.test(value) || value.toLowerCase() === 'system:p2p-backstop') {
    throw new InvalidEntryError(
      `${context}: resolution "${value}" is a machine disposition — disputed escrow is released only by a human ruling`,
    );
  }
}

export function disputeRulingMeta(ruling: EscrowDisputeRuling | undefined): Record<string, string> | undefined {
  if (!ruling) return undefined;
  const meta: Record<string, string> = {
    disputeId: ruling.disputeId.trim(),
    rulingBy: ruling.rulingBy.trim(),
  };
  const notes = ruling.notes?.trim();
  if (notes) meta.rulingNotes = notes;
  return meta;
}
