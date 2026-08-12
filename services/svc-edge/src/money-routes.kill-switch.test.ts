import { describe, expect, it } from 'vitest';
import {
  MONEY_PUBLIC_DOORS,
  edgeKillableMoneyModules,
  moneyKillControlFor,
  type ModuleId,
} from '@intafaced/config';
import { ENFORCEABLE_MODULES } from './routes.js';
import { KillSwitchState } from './kill-switch.js';

/**
 * D26-P2-10 — every money public door refuses when its module kill is armed.
 *
 * Pure `decide()` matrix (no Fastify). HTTP arming of the same switches is in
 * `control-plane.e2e.test.ts` ("money modules — same kill surface").
 */

const OPERATOR = '11111111-1111-4111-8111-111111111111';
const WHY = 'D26-P2-10 money-route kill completeness drill';

describe('D26-P2-10 money routes — kill-switch completeness', () => {
  it('every edge-killable money module is in ENFORCEABLE_MODULES (armable + enforceable)', () => {
    for (const module of edgeKillableMoneyModules()) {
      expect(ENFORCEABLE_MODULES.has(module), `${module} must sit behind the edge`).toBe(true);
      expect(moneyKillControlFor(module).kind).toBe('edge-module');
    }
  });

  it('refuses every named money commitment when that module is killed', () => {
    for (const door of MONEY_PUBLIC_DOORS) {
      expect(door.control.kind, door.id).toBe('edge-module');
      const module = (door.control as { module: ModuleId }).module;
      const state = new KillSwitchState();
      state.set(module, true, OPERATOR, WHY);

      const decision = state.decide(door.path, door.method);
      expect(decision, door.id).toMatchObject({
        module,
        refused: true,
        reason: 'module-killed',
      });
    }
  });

  it('does not refuse the same doors when the module is live', () => {
    const state = new KillSwitchState();
    for (const door of MONEY_PUBLIC_DOORS) {
      expect(state.decide(door.path, door.method).refused, door.id).toBe(false);
    }
  });

  it('killing pay does not trap trade (and the reverse) — module isolation', () => {
    const payKilled = new KillSwitchState();
    payKilled.set('pay', true, OPERATOR, WHY);
    expect(payKilled.decide('/api/pay/trpc/checkout.open', 'POST').refused).toBe(true);
    expect(payKilled.decide('/api/v1/orders', 'POST').refused).toBe(false);

    const tradeKilled = new KillSwitchState();
    tradeKilled.set('trade', true, OPERATOR, WHY);
    expect(tradeKilled.decide('/api/v1/orders', 'POST').refused).toBe(true);
    expect(tradeKilled.decide('/api/pay/trpc/checkout.open', 'POST').refused).toBe(false);
  });

  it('still lets trade cancels out while money creates refuse (asymmetry)', () => {
    const state = new KillSwitchState();
    state.set('trade', true, OPERATOR, WHY);
    expect(state.decide('/api/trade/trpc/orders.create', 'POST').refused).toBe(true);
    expect(state.decide('/api/trade/trpc/orders.cancel', 'POST').refused).toBe(false);
    expect(state.decide('/api/v1/orders/8f3c1d2e-0000-4000-8000-000000000001', 'DELETE').refused).toBe(false);
  });
});
