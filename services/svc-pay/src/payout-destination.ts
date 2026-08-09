/**
 * Payout destination kinds declared per rail — and structural shape of `ref`.
 *
 * Crypto must not accept an IBAN; bank rails must not accept a chain address.
 * Kind match alone is not enough: a bad ref used to pass the kind gate, then
 * poison the broadcast claim journal (EVM isAddress after claim) or invent a
 * sandbox "success" with gibberish. Shape is checked BEFORE withdrawHold so a
 * mismatch never strands a ledger hold.
 *
 * Unknown rails refuse closed — pass-through would re-open the hole for the
 * next adapter. A new rail adds one line to the map.
 *
 * card-sandbox accepts `bank` only because it invents a `po_*` ref; it is never
 * a live bank rail (`socket.psp-partners`). Bank refs still must look like an
 * IBAN so we never journal a non-destination. IFSC is not validated here
 * (no partner table) — non-IBAN bank refs refuse until that unit ships.
 */

export const PAYOUT_DESTINATION_KINDS: Readonly<Record<string, readonly string[]>> = {
  'crypto-native': ['crypto'],
  'card-sandbox': ['bank'],
  // Absent until a live bank rail ships; kind map ready so refuse is kind-correct if posture is relaxed.
  'bank-payout': ['bank'],
};

export type DestinationKindErrorCode = 'pay.destination_kind_mismatch' | 'pay.invalid_destination_ref';

export class DestinationKindError extends Error {
  readonly code: DestinationKindErrorCode;
  constructor(message: string, code: DestinationKindErrorCode = 'pay.destination_kind_mismatch') {
    super(message);
    this.name = 'DestinationKindError';
    this.code = code;
  }
}

/** EVM address: 0x + 40 hex digits. Checksum optional (structural only). */
export function isEvmAddressRef(ref: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(ref.trim());
}

/**
 * IBAN structural check: country + check digits + BBAN, length 15–34, mod-97 = 1.
 * Spaces ignored. Does not prove the account exists or is reachable.
 */
export function isIbanRef(ref: string): boolean {
  const compact = ref.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let expanded = '';
  for (const ch of rearranged) {
    if (ch >= 'A' && ch <= 'Z') expanded += String(ch.charCodeAt(0) - 55);
    else expanded += ch;
  }
  // mod 97 on big digit string without BigInt (portable)
  let remainder = 0;
  for (const d of expanded) {
    remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

function assertDestinationShape(kind: string, ref: string): void {
  const trimmed = ref.trim();
  if (kind === 'crypto') {
    if (!isEvmAddressRef(trimmed)) {
      throw new DestinationKindError(
        `Crypto destination ref must be a 20-byte EVM address (0x + 40 hex), got '${trimmed.slice(0, 24)}${trimmed.length > 24 ? '…' : ''}'`,
        'pay.invalid_destination_ref',
      );
    }
    return;
  }
  if (kind === 'bank') {
    if (!isIbanRef(trimmed)) {
      throw new DestinationKindError(
        `Bank destination ref must be a structural IBAN (mod-97). IFSC and other schemes are not validated here yet.`,
        'pay.invalid_destination_ref',
      );
    }
    return;
  }
  // Kind not in the known shape map — rail map already accepted it; refuse
  // shape so we never pass through an unshaped kind.
  throw new DestinationKindError(
    `Destination kind '${kind}' has no structural ref validator — refuse closed`,
    'pay.invalid_destination_ref',
  );
}

/**
 * Refuse a payout destination the rail cannot honestly use.
 * Throws DestinationKindError; callers map to PayError.
 */
export function assertPayoutDestinationKind(railId: string, destination: { kind: string; ref: string }): void {
  const kind = destination.kind?.trim() ?? '';
  const ref = destination.ref?.trim() ?? '';
  if (!kind || !ref) {
    throw new DestinationKindError('Payout destination requires a non-empty kind and ref');
  }
  const allowed = PAYOUT_DESTINATION_KINDS[railId];
  if (!allowed) {
    throw new DestinationKindError(`Rail ${railId} has no declared payout destination kinds — refuse closed`);
  }
  if (!allowed.includes(kind)) {
    throw new DestinationKindError(`Rail ${railId} cannot pay out to destination kind '${kind}' (accepted: ${allowed.join(', ')})`);
  }
  assertDestinationShape(kind, ref);
}
