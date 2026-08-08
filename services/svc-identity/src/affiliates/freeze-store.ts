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

  /**
   * Accrue commissions while applying this store's freeze set.
   * `tiers` is required — never invent product rates (DIRECTION §8).
   */
  accrue(input: { fee: FeeEvent; parent: ReadonlyMap<string, string>; tiers: readonly TierRate[]; maxDepth?: number }): CommissionRow[] {
    return accrueWithFreezes({
      fee: input.fee,
      parent: input.parent,
      tiers: input.tiers,
      maxDepth: input.maxDepth,
      frozenBeneficiaryIds: this.frozenIds(),
    });
  }
}

/** L3 — freeze board card from store. */
export function freezeStoreBoardCard(store: MemoryFreezeStore): {
  readonly frozen: number;
  readonly any: boolean;
  readonly ids: readonly string[];
} {
  return {
    frozen: store.freezeCount(),
    any: store.hasAnyFreeze(),
    ids: store.listFrozenBeneficiaryIds(),
  };
}

/** L3 — freeze status line. */
export function freezeStoreStatusLine(store: MemoryFreezeStore): string {
  const c = freezeStoreBoardCard(store);
  return `frozen=${c.frozen} any=${c.any ? '1' : '0'}`;
}

/** L3 — true when no freezes. */
export function freezeStoreStatusLineIsEmpty(store: MemoryFreezeStore): boolean {
  return store.freezeCount() === 0;
}

/** L3 — parse status. Invalid → null. */
export function parseFreezeStoreStatusLine(line: string): { readonly frozen: number; readonly any: boolean } | null {
  const m = line.trim().match(/^frozen=(\d+) any=([01])$/);
  if (!m) return null;
  return { frozen: Number(m[1]), any: m[2] === '1' };
}

/** L3 — true when status matches store. */
export function freezeStoreStatusLineMatches(store: MemoryFreezeStore): boolean {
  const p = parseFreezeStoreStatusLine(freezeStoreStatusLine(store));
  if (!p) return false;
  const c = freezeStoreBoardCard(store);
  return p.frozen === c.frozen && p.any === c.any;
}

/** L3 — true when any flag matches frozen>0. */
export function freezeStoreStatusLineConsistent(line: string): boolean {
  const p = parseFreezeStoreStatusLine(line);
  if (!p) return false;
  return p.any === p.frozen > 0;
}

/** L3 — export header. */
export function freezeStoreExportHeader(): string {
  return 'beneficiaryId,frozenBy,reason';
}

/** L3 — export lines (one per freeze). Empty → []. */
export function freezeStoreExportLines(store: MemoryFreezeStore): readonly string[] {
  return store.list().map((r) => `${r.beneficiaryId},${r.frozenBy},${r.reason.replace(/,/g, ' ')}`);
}

/** L3 — full export text. */
export function freezeStoreExportText(store: MemoryFreezeStore): string {
  return [freezeStoreExportHeader(), ...freezeStoreExportLines(store)].join('\n');
}

/** L3 — true when freeze count is within [min,max]. Invalid → false. */
export function freezeCountInRange(store: MemoryFreezeStore, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = store.freezeCount();
  return n >= min && n <= max;
}

/** L3 — true when freeze count is at least n. */
export function freezeCountAtLeast(store: MemoryFreezeStore, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return store.freezeCount() >= n;
}
