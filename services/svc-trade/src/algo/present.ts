import { formatAmount, type Amount } from '@intafaced/ledger-client';
import type { AlgoProgressView, TwapParent } from './types.js';

/**
 * Progress is a sum over real fills — or nothing.
 * The parent never stores filledQty; this view is derived at read time.
 */
export function presentAlgoProgress(parent: TwapParent, filledFromChildren: Amount): AlgoProgressView {
  return {
    parentId: parent.id,
    status: parent.status,
    haltReason: parent.haltReason,
    childrenEmitted: parent.children.length,
    missesRecorded: parent.misses.length,
    slicesPlanned: parent.slicesPlanned,
    nextSliceIndex: parent.nextSliceIndex,
    filledQty: formatAmount(filledFromChildren),
    totalQty: formatAmount(parent.totalQty),
  };
}

/** Keys that must NEVER appear on a parent object (fabrication surface). */
export const FORBIDDEN_PARENT_MONEY_KEYS = [
  'filledQty',
  'avgPrice',
  'averagePrice',
  'holdAmount',
  'holdAsset',
  'pnl',
  'realizedPnl',
  'progressPct',
  'progressPercent',
  'balance',
  'notional',
] as const;

export function assertParentHasNoMoneyFields(parent: TwapParent): void {
  const keys = Object.keys(parent);
  for (const bad of FORBIDDEN_PARENT_MONEY_KEYS) {
    if (keys.includes(bad)) {
      throw new Error(`algo parent must not carry money field "${bad}"`);
    }
  }
}
