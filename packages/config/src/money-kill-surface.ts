/**
 * MONEY KILL SURFACE (D26-P2-10) — one operator family for every money door.
 *
 * Done bar: every money route is killable from the same surface family, proven.
 *
 * ── Same surface family (do not invent a second console) ────────────────────
 *
 *   · Module kills  → `POST /admin/kill-switches` on svc-edge (`admin:write`+MFA)
 *                     enforced by the edge `onRequest` kill-switch guard.
 *   · Book freeze   → `POST /admin/ledger/freeze` on svc-edge (`admin:treasury`+MFA)
 *                     durable `posting_freeze` on svc-ledger — the only platform-wide
 *                     value freeze (see `freeze-authority.ts`).
 *
 * Module kills stop NEW COMMITMENTS at the public door. They do not replace the
 * ledger freeze, and they must not invent a fake "freeze pay" / "freeze trade"
 * book switch — those refuse via `assertFreezeAuthority`.
 *
 * ── What this file is / is not ──────────────────────────────────────────────
 *
 * Catalogue + invariants only. No I/O. Behaviour is proved by
 * `services/svc-edge/src/money-routes.kill-switch.test.ts` and the money matrix
 * in `control-plane.e2e.test.ts` (flip via `/admin/kill-switches`).
 */

import { MODULES, MODULE_IDS, type ModuleId } from './modules.js';

/** How a money door is halted from the shared operator surface. */
export type MoneyKillControl =
  | {
      readonly kind: 'edge-module';
      /** Module id armed on `POST /admin/kill-switches`. */
      readonly module: ModuleId;
    }
  | {
      readonly kind: 'ledger-freeze';
      /** Operator path — never a module flag. */
      readonly surface: '/admin/ledger/freeze';
    }
  | {
      readonly kind: 'via-sibling';
      readonly module: ModuleId;
      /** Kill this instead — the sibling that owns the public door. */
      readonly haltVia: ModuleId;
      readonly note: string;
    }
  | {
      readonly kind: 'not-deployed';
      readonly module: ModuleId;
      readonly note: string;
    };

/**
 * One public money commitment the operator must be able to stop.
 *
 * Paths are edge-facing (`/api/...`). Internal S2S jobs keep their own env
 * kill-switches (defence in depth) and are not listed here — the public door
 * is what D26-P2-10 closes.
 */
export interface MoneyPublicDoor {
  readonly id: string;
  readonly module: ModuleId;
  readonly method: 'POST' | 'DELETE' | 'PUT' | 'PATCH';
  readonly path: string;
  /** One sentence an operator can act on at 3am. */
  readonly what: string;
  readonly control: MoneyKillControl;
}

/**
 * Canonical money commitment doors — every live custodial public write that
 * must refuse when its kill control is armed.
 *
 * Extending this list is how a new money route stays in the prove suite: add a
 * row here, then the edge unit + e2e matrices fail closed until they cover it.
 */
export const MONEY_PUBLIC_DOORS: readonly MoneyPublicDoor[] = [
  {
    id: 'trade.trpc.create',
    module: 'trade',
    method: 'POST',
    path: '/api/trade/trpc/orders.create',
    what: 'place a spot/futures order over tRPC',
    control: { kind: 'edge-module', module: 'trade' },
  },
  {
    id: 'trade.ccxt.create',
    module: 'trade',
    method: 'POST',
    path: '/api/v1/orders',
    what: 'place an order over the public CCXT REST contract',
    control: { kind: 'edge-module', module: 'trade' },
  },
  {
    id: 'trade.ccxt.positions',
    module: 'trade',
    method: 'POST',
    path: '/api/v1/positions',
    what: 'open a futures position (new risk)',
    control: { kind: 'edge-module', module: 'trade' },
  },
  {
    id: 'pay.checkout.open',
    module: 'pay',
    method: 'POST',
    path: '/api/pay/trpc/checkout.open',
    what: 'open a hosted checkout session (takes money)',
    control: { kind: 'edge-module', module: 'pay' },
  },
  {
    id: 'pay.merchant.create',
    module: 'pay',
    method: 'POST',
    path: '/api/pay/trpc/merchant.create',
    what: 'create a merchant that can accept payments',
    control: { kind: 'edge-module', module: 'pay' },
  },
  {
    id: 'bank.earn.deposit',
    module: 'bank',
    method: 'POST',
    path: '/api/bank/trpc/earn.deposit',
    what: 'deposit into an earn pool (moves value)',
    control: { kind: 'edge-module', module: 'bank' },
  },
  {
    id: 'bank.transfers.schedule',
    module: 'bank',
    method: 'POST',
    path: '/api/bank/trpc/transfers.schedule',
    what: 'schedule a standing transfer',
    control: { kind: 'edge-module', module: 'bank' },
  },
  {
    id: 'p2p.trades.take',
    module: 'p2p',
    method: 'POST',
    path: '/api/p2p/trpc/trades.take',
    what: 'take a P2P offer (escrowLock)',
    control: { kind: 'edge-module', module: 'p2p' },
  },
  {
    id: 'p2p.offers.create',
    module: 'p2p',
    method: 'POST',
    path: '/api/p2p/trpc/offers.create',
    what: 'create a P2P offer',
    control: { kind: 'edge-module', module: 'p2p' },
  },
  {
    id: 'token.stake',
    module: 'token',
    method: 'POST',
    path: '/api/token/trpc/stake',
    what: 'open a stake (custodial lock)',
    control: { kind: 'edge-module', module: 'token' },
  },
  {
    id: 'token.mintEpoch',
    module: 'token',
    method: 'POST',
    path: '/api/token/trpc/mintEpoch',
    what: 'mint the next emission epoch',
    control: { kind: 'edge-module', module: 'token' },
  },
  {
    id: 'market.purchase',
    module: 'market',
    method: 'POST',
    path: '/api/market/trpc/purchase',
    what: 'purchase a marketplace listing',
    control: { kind: 'edge-module', module: 'market' },
  },
  {
    id: 'market.createListing',
    module: 'market',
    method: 'POST',
    path: '/api/market/trpc/createListing',
    what: 'create a paid marketplace listing',
    control: { kind: 'edge-module', module: 'market' },
  },
] as const;

/** Modules the edge kill-switch must be able to arm for money doors. */
export function edgeKillableMoneyModules(): readonly ModuleId[] {
  const out = new Set<ModuleId>();
  for (const door of MONEY_PUBLIC_DOORS) {
    if (door.control.kind === 'edge-module') out.add(door.control.module);
  }
  return MODULE_IDS.filter((id) => out.has(id));
}

/**
 * Every custodial module must declare how money movement on it is halted.
 *
 * Deployed-with-door → edge-module. Ledger → freeze. Matching engine → kill
 * trade. Undeployed placeholders → not-deployed (honest residual, not pretend).
 */
export function moneyKillControlFor(module: ModuleId): MoneyKillControl {
  if (module === 'ledger') {
    return { kind: 'ledger-freeze', surface: '/admin/ledger/freeze' };
  }
  if (module === 'matching') {
    return {
      kind: 'via-sibling',
      module: 'matching',
      haltVia: 'trade',
      note: 'svc-matching has no browser door; halt trade to stop new risk at the edge',
    };
  }
  if (module === 'launch' || module === 'mining-pool' || module === 'bridge') {
    return {
      kind: 'not-deployed',
      module,
      note: `${MODULES[module].service} has no live public door in this tree — residual, not pretend-killable`,
    };
  }
  if (edgeKillableMoneyModules().includes(module)) {
    return { kind: 'edge-module', module };
  }
  // Non-custodial modules are not money doors; callers should filter.
  return {
    kind: 'not-deployed',
    module,
    note: `${module} is not a custodial money door on the shared kill surface`,
  };
}

/**
 * Invariant: every custodial module has an honest kill control (edge, freeze,
 * sibling, or explicit not-deployed). Never silent.
 */
export function assertCustodialMoneyKillsComplete(): readonly string[] {
  const failures: string[] = [];
  for (const id of MODULE_IDS) {
    if (!MODULES[id].custodial) continue;
    const control = moneyKillControlFor(id);
    if (control.kind === 'edge-module' && control.module !== id) {
      failures.push(`${id}: edge-module control must name itself`);
    }
    if (control.kind === 'ledger-freeze' && id !== 'ledger') {
      failures.push(`${id}: only ledger may use ledger-freeze`);
    }
    if (control.kind === 'not-deployed' && (id === 'trade' || id === 'pay' || id === 'bank' || id === 'p2p' || id === 'token' || id === 'market')) {
      failures.push(`${id}: live money module must not be classified not-deployed`);
    }
  }
  return failures;
}
