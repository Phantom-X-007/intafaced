/**
 * Affiliates L3 — freeze audit store (non-pay).
 *
 * Operator freezes beneficiaries with a reason; accrual uses the id set.
 * No ledger, no invent rates. Payout remains Class M residual.
 */

import { accrueWithFreezes } from './freeze.js';
import type { FeeEvent, CommissionRow, TierRate } from './commission.js';

export type FreezeRecord = {
  readonly beneficiaryId: string;
  readonly frozenAt: Date;
  readonly frozenBy: string;
  readonly reason: string;
};

export type FreezeErrorCode = 'freeze.invalid' | 'freeze.already' | 'freeze.not_frozen' | 'freeze.not_found';

export class FreezeError extends Error {
  constructor(
    message: string,
    readonly code: FreezeErrorCode,
  ) {
    super(message);
    this.name = 'FreezeError';
  }
}

export function assertFreezeReason(reason: string): string {
  const t = reason.trim();
  if (t.length < 3) throw new FreezeError('Freeze reason min 3 characters', 'freeze.invalid');
  if (t.length > 500) throw new FreezeError('Freeze reason max 500 characters', 'freeze.invalid');
  return t;
}

/** In-memory freeze ledger for tests / Stage process store. */
export class MemoryFreezeStore {
  private readonly byId = new Map<string, FreezeRecord>();

  isFrozen(beneficiaryId: string): boolean {
    return this.byId.has(beneficiaryId);
  }

  frozenIds(): ReadonlySet<string> {
    return new Set(this.byId.keys());
  }

  /** L3 — freeze count for operator board (empty store → 0, not invent). */
  freezeCount(): number {
    return this.byId.size;
  }

  /**
   * L3 — frozen beneficiary ids sorted. Empty store → empty list.
   */
  listFrozenBeneficiaryIds(): readonly string[] {
    return [...this.byId.keys()].sort();
  }

  list(): readonly FreezeRecord[] {
    return [...this.byId.values()].sort((a, b) => a.frozenAt.getTime() - b.frozenAt.getTime());
  }

  freeze(input: { beneficiaryId: string; frozenBy: string; reason: string; now?: Date }): FreezeRecord {
    const beneficiaryId = input.beneficiaryId?.trim() ?? '';
    const frozenBy = input.frozenBy?.trim() ?? '';
    if (!beneficiaryId || !frozenBy) throw new FreezeError('beneficiaryId and frozenBy required', 'freeze.invalid');
    if (this.byId.has(beneficiaryId)) throw new FreezeError('Already frozen', 'freeze.already');
    const rec: FreezeRecord = {
      beneficiaryId,
      frozenBy,
      reason: assertFreezeReason(input.reason),
      frozenAt: input.now ?? new Date(),
    };
    this.byId.set(beneficiaryId, rec);
    return rec;
  }

  unfreeze(beneficiaryId: string): FreezeRecord {
    const rec = this.byId.get(beneficiaryId);
    if (!rec) throw new FreezeError('Not frozen', 'freeze.not_frozen');
    this.byId.delete(beneficiaryId);
    return rec;
  }

  /**
   * L3 — freeze reason for one beneficiary. Not frozen → null (no invent).
   */
  freezeReasonOf(beneficiaryId: string): string | null {
    const rec = this.byId.get(beneficiaryId.trim());
    return rec?.reason ?? null;
  }

  /**
   * L3 — true when at least one freeze is active. Empty store → false.
   */
  hasAnyFreeze(): boolean {
    return this.byId.size > 0;
  }

  /** Accrue commissions while applying this store's freeze set. */
  accrue(input: { fee: FeeEvent; parent: ReadonlyMap<string, string>; tiers?: readonly TierRate[]; maxDepth?: number }): CommissionRow[] {
    return accrueWithFreezes({
      fee: input.fee,
      parent: input.parent,
      tiers: input.tiers,
      maxDepth: input.maxDepth,
      frozenBeneficiaryIds: this.frozenIds(),
    });
  }
}
