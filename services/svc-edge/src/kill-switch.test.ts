import { describe, expect, it } from 'vitest';
import { KillSwitchState, MODULE_BY_PREFIX, procedureLeaf, procedureOf } from './kill-switch.js';
import { UPSTREAMS } from './routes.js';

describe('kill-switch route map', () => {
  it('covers every upstream, so no route is un-killable', () => {
    for (const upstream of UPSTREAMS) {
      expect(MODULE_BY_PREFIX.get(upstream.prefix), upstream.prefix).toBeDefined();
    }
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
    s.set('trade', true, 'incident 2026-07-29, book quoting stale prices');
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
    s.set('pay', true, 'rail partner outage, stop taking payments');
    expect(s.decide('/api/pay/webhooks/crypto', 'POST').refused).toBe(true);
  });

  it('comes back on, and the reason goes with it', () => {
    const s = state();
    expect(s.reasonFor('trade')).toContain('incident');
    s.set('trade', false, 'resolved');
    expect(s.isKilled('trade')).toBe(false);
    expect(s.reasonFor('trade')).toBeNull();
    expect(s.decide('/api/trade/trpc/orders.create', 'POST').refused).toBe(false);
  });
});

describe('an unrouted path', () => {
  it('is nobody"s module, and the 404 is the proxy"s job not the switch"s', () => {
    const s = new KillSwitchState();
    s.set('trade', true, 'incident 2026-07-29, book quoting stale prices');
    expect(s.decide('/api/unknown/x', 'POST')).toMatchObject({ module: null, refused: false, reason: 'no-route' });
  });
});
