/**
 * Assign or correct an existing child fill on a live TWAP/VWAP/POV parent.
 *
 * Operator door: tag a venue-EMS child fill to a client/account, or append
 * a qty/price correction. EMS fill evidence must already exist — this never
 * invents a print, never posts ledger, and does not touch matching.
 * First assign is append-only; a second assign refuses unless the operator
 * records an explicit correction. Corrections append; they never rewrite.
 */
import { formatAmount, parseAmount, ZERO } from '@intafaced/ledger-client';
import type { EmsOrderStore } from './oms-ems-store.js';
import { fillFacts, type ChildFillFacts } from './oms-fill-confirm.js';
import type { AlgoKind, ApprovedAlgoParent, ApprovedAlgoParentStore } from './oms-start.js';

export type FillAssignKind = 'assign' | 'correct';

export type ChildFillAssignment = {
  readonly clientOrderId: string;
  readonly parentClientOrderId: string;
  readonly accountTag: string;
  readonly filledAmount: string;
  readonly averagePrice: string;
  readonly operatorId: string;
  readonly recordedAt: string;
  readonly kind: FillAssignKind;
};

export interface FillAssignStore {
  /** Latest trail row, if any. */
  get(clientOrderId: string): ChildFillAssignment | null;
  /** Append-only history. Empty when never assigned or corrected. */
  trail(clientOrderId: string): readonly ChildFillAssignment[];
  /** First assign only. Returns null when that child already has a tag. */
  assign(row: ChildFillAssignment): ChildFillAssignment | null;
  /** Always appends. Never rewrites prior rows. */
  correct(row: ChildFillAssignment): ChildFillAssignment;
}

export class InMemoryFillAssignStore implements FillAssignStore {
  private readonly byClientOrderId = new Map<string, ChildFillAssignment>();
  private readonly trails = new Map<string, ChildFillAssignment[]>();

  get(clientOrderId: string): ChildFillAssignment | null {
    const id = clientOrderId.trim();
    if (!id) return null;
    return this.byClientOrderId.get(id) ?? null;
  }

  trail(clientOrderId: string): readonly ChildFillAssignment[] {
    const id = clientOrderId.trim();
    if (!id) return [];
    return [...(this.trails.get(id) ?? [])];
  }

  assign(row: ChildFillAssignment): ChildFillAssignment | null {
    const id = row.clientOrderId.trim();
    if (!id) return null;
    if (tagged(this.byClientOrderId.get(id))) return null;
    const next: ChildFillAssignment = {
      clientOrderId: id,
      parentClientOrderId: row.parentClientOrderId,
      accountTag: row.accountTag,
      filledAmount: row.filledAmount,
      averagePrice: row.averagePrice,
      operatorId: row.operatorId,
      recordedAt: row.recordedAt,
      kind: 'assign',
    };
    this.byClientOrderId.set(id, next);
    const trail = this.trails.get(id) ?? [];
    trail.push(next);
    this.trails.set(id, trail);
    return { ...next };
  }

  correct(row: ChildFillAssignment): ChildFillAssignment {
    const id = row.clientOrderId.trim();
    const next: ChildFillAssignment = {
      clientOrderId: id,
      parentClientOrderId: row.parentClientOrderId,
      accountTag: row.accountTag,
      filledAmount: row.filledAmount,
      averagePrice: row.averagePrice,
      operatorId: row.operatorId,
      recordedAt: row.recordedAt,
      kind: 'correct',
    };
    this.byClientOrderId.set(id, next);
    const trail = this.trails.get(id) ?? [];
    trail.push(next);
    this.trails.set(id, trail);
    return { ...next };
  }
}

export type OmsAssignFillOk = {
  readonly ok: true;
  readonly assigned: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly child: { readonly clientOrderId: string };
  readonly fill: ChildFillFacts;
  readonly accountTag: string;
  readonly operatorId: string;
  readonly assignedAt: string;
};

export type OmsCorrectFillOk = {
  readonly ok: true;
  readonly corrected: true;
  readonly parent: { readonly parentClientOrderId: string; readonly kind: AlgoKind };
  readonly child: { readonly clientOrderId: string };
  readonly fill: { readonly filledAmount: string; readonly averagePrice: string };
  readonly accountTag: string;
  readonly operatorId: string;
  readonly correctedAt: string;
};

export type OmsFillAssignRefuse =
  | { readonly ok: false; readonly reason: 'missing_operator'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_target'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'paper'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_live'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_child'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'ems_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'fill_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_fill'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_mismatch'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_assigned'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_qty'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_price'; readonly detail: string };

export type OmsAssignFillResult = OmsAssignFillOk | OmsFillAssignRefuse;
export type OmsCorrectFillResult = OmsCorrectFillOk | OmsFillAssignRefuse;

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsFillAssignRefuse['reason'], detail: string): OmsFillAssignRefuse {
  return { ok: false, reason, detail };
}

function liveStatus(status: string): boolean {
  return status === 'approved' || status === 'running';
}

function operatorOf(operatorId?: string): string {
  return operatorId?.trim() ?? '';
}

function targetOf(accountTag?: string): string {
  return accountTag?.trim() ?? '';
}

function tagged(row: ChildFillAssignment | null | undefined): boolean {
  return Boolean(row?.accountTag.trim());
}

function locateParent(input: {
  parentClientOrderId?: string;
  parentStore?: ApprovedAlgoParentStore;
}): { ok: true; parent: ApprovedAlgoParent } | OmsFillAssignRefuse {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for fill assign');
  }
  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'paper') {
    return refuse('paper', `parent ${parentClientOrderId} is paper — refusing to assign a paper child fill`);
  }
  if (!liveStatus(existing.status)) {
    return refuse(
      'not_live',
      `parent ${parentClientOrderId} is ${existing.status} — fill assign needs a live (approved or running) parent`,
    );
  }
  return { ok: true, parent: existing };
}

function locateChildFill(input: {
  parentClientOrderId: string;
  clientOrderId?: string;
  emsStore?: EmsOrderStore;
}): { ok: true; facts: ChildFillFacts } | OmsFillAssignRefuse {
  const clientOrderId = input.clientOrderId?.trim() ?? '';
  if (!clientOrderId) {
    return refuse('missing_child', 'clientOrderId is required — refusing to invent a child fill');
  }
  if (!input.emsStore) {
    return refuse('ems_store_unwired', 'EMS evidence store is required for fill assign');
  }
  const row = input.emsStore.get(clientOrderId);
  const facts = row ? fillFacts(row) : null;
  if (!row || !facts) {
    return refuse('missing_fill', `no child fill evidence for ${clientOrderId} — refusing to invent a fill from residual or schedule`);
  }
  const owner = row.parentClientOrderId?.trim() ?? '';
  if (owner !== input.parentClientOrderId) {
    return refuse(
      'parent_mismatch',
      `child fill ${clientOrderId} belongs to ${owner || 'no parent'} — refusing to assign it on ${input.parentClientOrderId}`,
    );
  }
  return { ok: true, facts };
}

function ledgerQty(raw?: string): { ok: true; formatted: string } | OmsFillAssignRefuse {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return refuse('missing_qty', 'qty is required — refusing to invent a print from residual or schedule');
  }
  let amount;
  try {
    amount = parseAmount(trimmed);
  } catch {
    return refuse('missing_qty', 'qty is not a ledger amount — refusing to invent a print');
  }
  if (amount <= ZERO) {
    return refuse('missing_qty', 'qty must be a positive ledger amount — refusing to invent a print');
  }
  return { ok: true, formatted: formatAmount(amount) };
}

function ledgerPrice(raw?: string): { ok: true; formatted: string } | OmsFillAssignRefuse {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return refuse('missing_price', 'price is required — refusing to invent a print');
  }
  let price;
  try {
    price = parseAmount(trimmed);
  } catch {
    return refuse('missing_price', 'price is not a ledger amount — refusing to invent a print');
  }
  if (price <= ZERO) {
    return refuse('missing_price', 'price must be a positive ledger amount — refusing to invent a print');
  }
  return { ok: true, formatted: formatAmount(price) };
}

export function assignChildFill(input: {
  parentClientOrderId?: string;
  clientOrderId?: string;
  accountTag?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
  emsStore?: EmsOrderStore;
  fillAssignStore?: FillAssignStore;
  now?: Date;
}): OmsAssignFillResult {
  const operatorId = operatorOf(input.operatorId);
  if (!operatorId) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  const accountTag = targetOf(input.accountTag);
  if (!accountTag) {
    return refuse('missing_target', 'account tag is required — refusing to invent a client');
  }
  const located = locateParent({
    parentClientOrderId: input.parentClientOrderId,
    parentStore: input.parentStore,
  });
  if (!located.ok) return located;
  const child = locateChildFill({
    parentClientOrderId: located.parent.parentClientOrderId,
    clientOrderId: input.clientOrderId,
    emsStore: input.emsStore,
  });
  if (!child.ok) return child;
  if (!input.fillAssignStore) {
    return refuse('fill_store_unwired', 'fill assign store is required for fill assign');
  }
  const existing = input.fillAssignStore.get(child.facts.clientOrderId);
  if (tagged(existing)) {
    return refuse(
      'already_assigned',
      `child fill ${child.facts.clientOrderId} is already assigned to ${existing!.accountTag} — use correctFill to append a correction`,
    );
  }
  const recordedAt = (input.now ?? new Date()).toISOString();
  const recorded = input.fillAssignStore.assign({
    clientOrderId: child.facts.clientOrderId,
    parentClientOrderId: located.parent.parentClientOrderId,
    accountTag,
    filledAmount: child.facts.filledAmount,
    averagePrice: child.facts.averagePrice,
    operatorId,
    recordedAt,
    kind: 'assign',
  });
  if (!recorded) {
    return refuse(
      'already_assigned',
      `child fill ${child.facts.clientOrderId} is already assigned — use correctFill to append a correction`,
    );
  }
  return {
    ok: true,
    assigned: true,
    parent: { parentClientOrderId: located.parent.parentClientOrderId, kind: located.parent.kind },
    child: { clientOrderId: recorded.clientOrderId },
    fill: child.facts,
    accountTag: recorded.accountTag,
    operatorId: recorded.operatorId,
    assignedAt: recorded.recordedAt,
  };
}

export function correctChildFill(input: {
  parentClientOrderId?: string;
  clientOrderId?: string;
  accountTag?: string;
  amount?: string;
  price?: string;
  operatorId?: string;
  parentStore?: ApprovedAlgoParentStore;
  emsStore?: EmsOrderStore;
  fillAssignStore?: FillAssignStore;
  now?: Date;
}): OmsCorrectFillResult {
  const operatorId = operatorOf(input.operatorId);
  if (!operatorId) {
    return refuse('missing_operator', 'operator id is required — refusing to invent a user');
  }
  const located = locateParent({
    parentClientOrderId: input.parentClientOrderId,
    parentStore: input.parentStore,
  });
  if (!located.ok) return located;
  const child = locateChildFill({
    parentClientOrderId: located.parent.parentClientOrderId,
    clientOrderId: input.clientOrderId,
    emsStore: input.emsStore,
  });
  if (!child.ok) return child;
  const qty = ledgerQty(input.amount);
  if (!qty.ok) return qty;
  const px = ledgerPrice(input.price);
  if (!px.ok) return px;
  if (!input.fillAssignStore) {
    return refuse('fill_store_unwired', 'fill assign store is required for fill correction');
  }
  const previous = input.fillAssignStore.get(child.facts.clientOrderId);
  const accountTag = targetOf(input.accountTag) || previous?.accountTag.trim() || '';
  if (!accountTag) {
    return refuse('missing_target', 'account tag is required — refusing to invent a client');
  }
  const recordedAt = (input.now ?? new Date()).toISOString();
  const recorded = input.fillAssignStore.correct({
    clientOrderId: child.facts.clientOrderId,
    parentClientOrderId: located.parent.parentClientOrderId,
    accountTag,
    filledAmount: qty.formatted,
    averagePrice: px.formatted,
    operatorId,
    recordedAt,
    kind: 'correct',
  });
  return {
    ok: true,
    corrected: true,
    parent: { parentClientOrderId: located.parent.parentClientOrderId, kind: located.parent.kind },
    child: { clientOrderId: recorded.clientOrderId },
    fill: { filledAmount: recorded.filledAmount, averagePrice: recorded.averagePrice },
    accountTag: recorded.accountTag,
    operatorId: recorded.operatorId,
    correctedAt: recorded.recordedAt,
  };
}
