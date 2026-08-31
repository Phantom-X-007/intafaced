/**
 * PTX-M13-R04 / M01 — house MM and house execution must not see tenant private intent.
 *
 * A house path handed tenant private resting orders, private quotes, or private
 * intent refuses. Public L2 (the public feed) is allowed. This package does not
 * invent a book, mids, or quote payloads.
 *
 * Law: PRO_TRADER_EXCHANGE_DEFINITIVE_SCOPE.md M13-R04; C10 §5/§9.
 */

export const HOUSE_MAY_SEE_TENANT_PRIVATE_INTENT: false = false;

export type HouseMarketViewKind = 'public_l2' | 'tenant_private_resting_orders' | 'tenant_private_quotes' | 'tenant_private_intent';

export type HouseMarketView = {
  readonly kind: HouseMarketViewKind;
};

export type HouseIntentBarrierRefuseReason = 'tenant_private_resting_orders' | 'tenant_private_quotes' | 'tenant_private_intent';

export type HouseIntentBarrierRefusal = {
  readonly ok: false;
  readonly reason: HouseIntentBarrierRefuseReason;
  readonly detail: string;
};

export type HouseIntentBarrierClear = {
  readonly ok: true;
  readonly view: 'public_l2';
};

export type HouseIntentBarrierResult = HouseIntentBarrierClear | HouseIntentBarrierRefusal;

/**
 * Optional bag handed to a house MM/execution path. Any private field that is
 * present (including `null` or empty) is a leak and refuses. Public L2 may be
 * present or omitted.
 */
export type HouseMarketPayload = {
  readonly publicL2?: unknown;
  readonly tenantPrivateRestingOrders?: unknown;
  readonly tenantPrivateQuotes?: unknown;
  readonly tenantPrivateIntent?: unknown;
};

export const TENANT_PRIVATE_RESTING_ORDERS_DETAIL =
  'PTX-M13-R04 — house market-making / house execution must not read tenant private resting orders';

export const TENANT_PRIVATE_QUOTES_DETAIL = 'PTX-M13-R04 — house market-making / house execution must not read tenant private quotes';

export const TENANT_PRIVATE_INTENT_DETAIL = 'PTX-M13-R04 — house market-making / house execution must not read tenant private intent';

function handed(value: unknown): boolean {
  return value !== undefined;
}

function refuse(reason: HouseIntentBarrierRefuseReason, detail: string): HouseIntentBarrierRefusal {
  return { ok: false, reason, detail };
}

const CLEAR: HouseIntentBarrierClear = { ok: true, view: 'public_l2' };

/** Public L2 is the only market view a house path may read. */
export function houseMayReadMarketView(kind: HouseMarketViewKind): boolean {
  return kind === 'public_l2';
}

/**
 * Tagged house market view gate.
 *
 * Public L2 clears. Private resting orders, private quotes, and private intent refuse.
 */
export function isolateHouseIntentBarrier(view: HouseMarketView): HouseIntentBarrierResult {
  if (view.kind === 'tenant_private_resting_orders') {
    return refuse('tenant_private_resting_orders', TENANT_PRIVATE_RESTING_ORDERS_DETAIL);
  }
  if (view.kind === 'tenant_private_quotes') {
    return refuse('tenant_private_quotes', TENANT_PRIVATE_QUOTES_DETAIL);
  }
  if (view.kind === 'tenant_private_intent') {
    return refuse('tenant_private_intent', TENANT_PRIVATE_INTENT_DETAIL);
  }
  return CLEAR;
}

/**
 * House path payload gate.
 *
 * Order: tenant_private_resting_orders → tenant_private_quotes → tenant_private_intent → clear.
 * Public L2 may ride along; it never licenses a private field.
 */
export function admitHouseMarketPayload(payload: HouseMarketPayload): HouseIntentBarrierResult {
  if (handed(payload.tenantPrivateRestingOrders)) {
    return refuse('tenant_private_resting_orders', TENANT_PRIVATE_RESTING_ORDERS_DETAIL);
  }
  if (handed(payload.tenantPrivateQuotes)) {
    return refuse('tenant_private_quotes', TENANT_PRIVATE_QUOTES_DETAIL);
  }
  if (handed(payload.tenantPrivateIntent)) {
    return refuse('tenant_private_intent', TENANT_PRIVATE_INTENT_DETAIL);
  }
  return CLEAR;
}
