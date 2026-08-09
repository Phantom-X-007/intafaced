/**
 * Payout destination kinds declared per rail.
 *
 * Crypto must not accept an IBAN; bank rails must not accept a chain address.
 * Checked BEFORE withdrawHold so a mismatch never strands a ledger hold.
 *
 * Unknown rails refuse closed — pass-through would re-open the hole for the
 * next adapter. A new rail adds one line to the map.
 *
 * card-sandbox accepts `bank` only because it invents a `po_*` ref; it is never
 * a live bank rail (`socket.psp-partners`).
 */
export const PAYOUT_DESTINATION_KINDS: Readonly<Record<string, readonly string[]>> = {
  'crypto-native': ['crypto'],
  'card-sandbox': ['bank'],
};

export type DestinationKindErrorCode = 'pay.destination_kind_mismatch';

export class DestinationKindError extends Error {
  readonly code: DestinationKindErrorCode = 'pay.destination_kind_mismatch';
  constructor(message: string) {
    super(message);
    this.name = 'DestinationKindError';
  }
}

/**
 * Refuse a payout destination the rail cannot honestly use.
 * Throws DestinationKindError; callers map to PayError.
 */
export function assertPayoutDestinationKind(railId: string, destination: { kind: string; ref: string }): void {
  const kind = destination.kind?.trim() ?? '';
  if (!kind || !(destination.ref?.trim() ?? '')) {
    throw new DestinationKindError('Payout destination requires a non-empty kind and ref');
  }
  const allowed = PAYOUT_DESTINATION_KINDS[railId];
  if (!allowed) {
    throw new DestinationKindError(`Rail ${railId} has no declared payout destination kinds — refuse closed`);
  }
  if (!allowed.includes(kind)) {
    throw new DestinationKindError(`Rail ${railId} cannot pay out to destination kind '${kind}' (accepted: ${allowed.join(', ')})`);
  }
}
