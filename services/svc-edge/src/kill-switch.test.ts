import { describe, expect, it } from 'vitest';
import { isModuleId } from '@intafaced/config';
import { ALWAYS_ALLOWED_REST, KillSwitchState, MODULE_BY_PREFIX, procedureLeaf, procedureOf } from './kill-switch.js';
import { UPSTREAMS } from './routes.js';

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const WHY = 'incident 2026-07-30, book quoting stale prices';

describe('kill-switch route map', () => {
  it('covers every upstream, so no route is un-killable', () => {
    for (const upstream of UPSTREAMS) {
      expect(MODULE_BY_PREFIX.get(upstream.prefix), upstream.prefix).toBeDefined();
    }
  });

  it('names a real module for every route', () => {
    for (const [prefix, module] of MODULE_BY_PREFIX) {
      expect(isModuleId(module), `${prefix} → ${module}`).toBe(true);
    }
  });

  /**
   * THE BUG. `/api/v1` is the public CCXT REST contract and it forwards to
   * `svc-trade`, but the prefix does not spell "trade". An earlier revision
   * derived the module by stripping `/api/`, which meant `/api/v1` mapped to
   * nothing — so halting `trade` would have refused the tRPC order path while
   * `POST /api/v1/orders` kept taking new risk, with the console showing
   * "trade: killed" the whole time.
   */
  it('maps the CCXT REST prefix to trade, not to "v1"', () => {
    expect(MODULE_BY_PREFIX.get('/api/v1')).toBe('trade');
  });

  it('routes that share an upstream share a module, or halting one halts half of it', () => {
    expect(MODULE_BY_PREFIX.get('/api/trade')).toBe(MODULE_BY_PREFIX.get('/api/v1'));
  });
});

describe('procedure parsing', () => {
  it('reads the tRPC procedure out of a proxied path', () => {
    expect(procedureOf('/api/trade/trpc/orders.create')).toBe('orders.create');
    expect(procedureOf('/api/trade/trpc/orders.cancel?batch=1')).toBe('orders.cancel');
  });

  it('has no procedure for a non-tRPC path', () => {
    expect(procedureOf('/api/pay/webhooks/crypto')).toBeNull();
  });

  it('takes the leaf, so nesting depth does not change the rule', () => {
    expect(procedureLeaf('orders.cancel')).toBe('cancel');
    expect(procedureLeaf('spot.orders.cancel')).toBe('cancel');
  });
});

describe('a killed module', () => {
  const state = () => {
    const s = new KillSwitchState();
    s.set('trade', true, OPERATOR, WHY);
    return s;
  };

  /**
   * §14's own worked example, and the reason the whole file exists: "`trade.spot`
   * disabled refuses new orders while still allowing cancels."
   */
  it('refuses a new order', () => {
    const d = state().decide('/api/trade/trpc/orders.create', 'POST');
    expect(d).toMatchObject({ module: 'trade', refused: true, reason: 'module-killed' });
  });

  it('still lets a user cancel — a control that traps funds is not a safety control', () => {
    const d = state().decide('/api/trade/trpc/orders.cancel', 'POST');
    expect(d).toMatchObject({ module: 'trade', refused: false, reason: 'lets-the-user-out' });
  });

  it('still serves reads', () => {
    expect(state().decide('/api/trade/trpc/orders.open', 'GET').refused).toBe(false);
    expect(state().decide('/api/trade/trpc/markets.list', 'GET').refused).toBe(false);
  });

  it('does not touch any other module', () => {
    const s = state();
    expect(s.decide('/api/identity/trpc/auth.login', 'POST').refused).toBe(false);
    expect(s.decide('/api/pay/trpc/deposit.credit', 'POST').refused).toBe(false);
  });

  it('refuses a non-tRPC write too — an unknown shape is a commitment', () => {
    const s = new KillSwitchState();
    s.set('pay', true, OPERATOR, 'rail partner outage, stop taking payments');
    expect(s.decide('/api/pay/webhooks/crypto', 'POST').refused).toBe(true);
  });

  it('comes back on, and the reason goes with it', () => {
    const s = state();
    expect(s.reasonFor('trade')).toContain('incident');
    s.set('trade', false, OPERATOR, 'resolved');
    expect(s.isKilled('trade')).toBe(false);
    expect(s.reasonFor('trade')).toBeNull();
    expect(s.decide('/api/trade/trpc/orders.create', 'POST').refused).toBe(false);
  });
});

/**
 * THE OTHER HALF OF THE SAME BUG, and the one that failed in the trapping
 * direction.
 *
 * `svc-trade` serves cancels twice: `orders.cancel` over tRPC, and the CCXT REST
 * contract every ccxt client actually calls. The tRPC rule was the entire escape
 * hatch, so `DELETE /api/v1/orders/:id` had no procedure, fell through to "an
 * unknown shape is a commitment", and was refused. A halted market would have
 * left users holding open orders with no way to close them — the precise outcome
 * the asymmetry exists to prevent.
 */
describe('a killed market still lets users out through the REST contract', () => {
  const state = () => {
    const s = new KillSwitchState();
    s.set('trade', true, OPERATOR, WHY);
    return s;
  };

  it('refuses POST /api/v1/orders — that is new risk', () => {
    expect(state().decide('/api/v1/orders', 'POST')).toMatchObject({ module: 'trade', refused: true, reason: 'module-killed' });
  });

  it('allows DELETE /api/v1/orders/:id — cancel one', () => {
    expect(state().decide('/api/v1/orders/8f3c1d2e-0000-4000-8000-000000000001', 'DELETE')).toMatchObject({
      refused: false,
      reason: 'lets-the-user-out',
    });
  });

  it('allows DELETE /api/v1/orders — cancel all', () => {
    expect(state().decide('/api/v1/orders', 'DELETE')).toMatchObject({ refused: false, reason: 'lets-the-user-out' });
  });

  it('allows cancel-all with a symbol filter — a query string must not decide whether you can leave', () => {
    expect(state().decide('/api/v1/orders?symbol=BTC/USDT', 'DELETE').refused).toBe(false);
  });

  it('still serves the REST reads a user needs to see what they are cancelling', () => {
    expect(state().decide('/api/v1/orders/open', 'GET').refused).toBe(false);
    expect(state().decide('/api/v1/account/balance', 'GET').refused).toBe(false);
  });

  it('treats the method case-insensitively, because a proxy is not a style guide', () => {
    expect(state().decide('/api/v1/orders', 'delete').refused).toBe(false);
    expect(state().decide('/api/v1/orders/x', 'Delete').refused).toBe(false);
  });

  it('does not let the release list leak to a different module', () => {
    const s = new KillSwitchState();
    s.set('pay', true, OPERATOR, 'rail partner outage, stop taking payments');
    // Same shape, different module: nothing in ALWAYS_ALLOWED_REST names it.
    expect(s.decide('/api/pay/orders/x', 'DELETE').refused).toBe(true);
  });

  it('keeps every release entry explicit and upper-cased', () => {
    // Guards against somebody adding a release path without an argument for it.
    for (const r of ALWAYS_ALLOWED_REST) {
      expect(r.what.length, `${r.method} ${r.pattern}`).toBeGreaterThan(0);
      expect(r.method).toBe(r.method.toUpperCase());
    }
  });
});

describe('an unrouted path', () => {
  it('is nobody"s module, and the 404 is the proxy"s job not the switch"s', () => {
    const s = new KillSwitchState();
    s.set('trade', true, OPERATOR, WHY);
    expect(s.decide('/api/unknown/x', 'POST')).toMatchObject({ module: null, refused: false, reason: 'no-route' });
  });

  it('matches on a segment boundary, so /api/tradesomething is not trade', () => {
    const s = new KillSwitchState();
    s.set('trade', true, OPERATOR, WHY);
    expect(s.decide('/api/tradesomething/x', 'POST').module).toBeNull();
  });
});

/**
 * The one bug that makes a safety control worse than nothing.
 *
 * If the switch's own check throws and the request is allowed through, the
 * operator believes the market is halted, the console says it is halted, and
 * orders are being accepted.
 */
describe('failing closed', () => {
  it('refuses when the decision itself throws', () => {
    const s = new KillSwitchState();
    // Broken from the outside rather than by reaching into privates: a pathname
    // that is not a string makes `startsWith` throw inside `evaluate`.
    const d = s.decide(undefined as unknown as string, 'POST');
    expect(d).toMatchObject({ refused: true, reason: 'undecidable' });
  });

  it('reports undecidable distinctly from a deliberate halt', () => {
    // The two call for different responses at 3am, so they must never share a
    // reason code in the logs.
    const s = new KillSwitchState();
    s.set('trade', true, OPERATOR, WHY);
    expect(s.decide('/api/trade/trpc/orders.create', 'POST').reason).toBe('module-killed');
    expect(s.decide(undefined as unknown as string, 'POST').reason).toBe('undecidable');
  });

  it('does not throw out of decide, whatever it is given', () => {
    const s = new KillSwitchState();
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(() => s.decide(bad as unknown as string, 'POST')).not.toThrow();
      expect(s.decide(bad as unknown as string, 'POST').refused).toBe(true);
    }
  });
});
