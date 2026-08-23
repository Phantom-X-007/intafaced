import { parseAmount } from '@intafaced/ledger-client';

export type MmMidProvenance = 'configured' | 'venue';

/**
 * A seed price which crossed one of the two admitted production boundaries.
 * The private constructor prevents a bare decimal from satisfying the port.
 */
export class AcceptedMmMid {
  private constructor(
    readonly price: string,
    readonly provenance: MmMidProvenance,
  ) {}

  static configured(price: string): AcceptedMmMid | null {
    return AcceptedMmMid.create(price, 'configured');
  }

  static venue(price: string): AcceptedMmMid | null {
    return AcceptedMmMid.create(price, 'venue');
  }

  private static create(price: string, provenance: MmMidProvenance): AcceptedMmMid | null {
    const normalized = String(price).trim();
    if (normalized === '') return null;
    try {
      if (parseAmount(normalized) <= 0n) return null;
    } catch {
      return null;
    }
    return new AcceptedMmMid(normalized, provenance);
  }
}

export function acceptedMmMidPrice(value: unknown): string | null {
  return value instanceof AcceptedMmMid ? value.price : null;
}
