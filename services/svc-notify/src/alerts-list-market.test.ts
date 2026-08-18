import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { AlertService } from './alerts/service.js';
import { MemoryAlertStore } from './alerts/store.js';
import type { MarkSource } from './alerts/types.js';
import { createNotifyRouter } from './router.js';
import { NotifyService } from './notify-service.js';
import { MemoryNotifyStore } from './store.js';

/**
 * Price-alert list — optional exact-match marketId filter.
 *
 * Omitted marketId still returns mixed markets (today). Provided marketId is
 * a store predicate, never a mixed-page post-filter. Unknown market is empty
 * items. Invalid empty/too-long is 400. Evaluation still rides the list.
 */

const SECRET = 'a-notify-alerts-market-test-secret-long';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-notify' });

function principal(userId = USER): Principal {
  return {
    sub: userId,
    userId,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['notify:read', 'notify:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
}

function signed(userId = USER) {
  const raw = encodePrincipal(principal(userId));
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-alerts-market',
  });
}

function harness() {
  const notify = new NotifyService(new MemoryNotifyStore(), { fanoutEnabled: true });
  const marks: MarkSource = {
    kind: 'dark',
    async quote() {
      return { kind: 'unavailable', reason: 'dark', detail: 'no mark source configured' };
    },
  };
  const alerts = new AlertService(new MemoryAlertStore(), marks, notify);
  const caller = createNotifyRouter(notify, alerts).createCaller(signed());
  return { alerts, caller };
}

describe('notify.alerts — optional marketId filter', () => {
  it('omitted marketId returns mixed markets for the caller, with evaluation', async () => {
    const { alerts, caller } = harness();
    const btc = await alerts.create({ userId: USER, marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    const eth = await alerts.create({ userId: USER, marketId: 'ETH-USD', direction: 'below', targetPrice: '50' });
    await alerts.create({ userId: OTHER, marketId: 'BTC-USD', direction: 'above', targetPrice: '90' });

    const omitted = await caller.notify.alerts();
    const emptyInput = await caller.notify.alerts({});
    expect(omitted.items.map((r) => r.id).sort()).toEqual([btc.id, eth.id].sort());
    expect(emptyInput.items.map((r) => r.id).sort()).toEqual([btc.id, eth.id].sort());
    expect(omitted.evaluation).toEqual({ markSource: 'dark', canFire: false, code: 'alert.price_unavailable' });
    expect(omitted.items.every((r) => r.userId === USER)).toBe(true);
  });

  it('exact marketId returns only that market and still includes evaluation', async () => {
    const { alerts, caller } = harness();
    const btc = await alerts.create({ userId: USER, marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    await alerts.create({ userId: USER, marketId: 'ETH-USD', direction: 'below', targetPrice: '50' });

    const page = await caller.notify.alerts({ marketId: 'BTC-USD' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.id).toBe(btc.id);
    expect(page.items[0]!.marketId).toBe('BTC-USD');
    expect(page.items[0]!.targetPrice).toBe('100');
    expect(page.evaluation).toEqual({ markSource: 'dark', canFire: false, code: 'alert.price_unavailable' });
  });

  it('unknown market with no watches returns empty items, not a fake watch', async () => {
    const { alerts, caller } = harness();
    await alerts.create({ userId: USER, marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });

    const page = await caller.notify.alerts({ marketId: 'SOL-USD' });
    expect(page.items).toEqual([]);
    expect(page.evaluation).toBeDefined();
  });

  it('another owner is never leaked for the same marketId', async () => {
    const { alerts } = harness();
    await alerts.create({ userId: USER, marketId: 'BTC-USD', direction: 'above', targetPrice: '100' });
    const theirs = await alerts.create({ userId: OTHER, marketId: 'BTC-USD', direction: 'above', targetPrice: '90' });

    const mine = await createNotifyRouter(new NotifyService(new MemoryNotifyStore(), { fanoutEnabled: true }), alerts)
      .createCaller(signed(USER))
      .notify.alerts({ marketId: 'BTC-USD' });
    expect(mine.items.every((r) => r.userId === USER)).toBe(true);
    expect(mine.items.map((r) => r.id)).not.toContain(theirs.id);

    const other = await createNotifyRouter(new NotifyService(new MemoryNotifyStore(), { fanoutEnabled: true }), alerts)
      .createCaller(signed(OTHER))
      .notify.alerts({ marketId: 'BTC-USD' });
    expect(other.items.map((r) => r.id)).toEqual([theirs.id]);
  });

  it('empty or too-long marketId is 400', async () => {
    const { caller } = harness();
    await expect(caller.notify.alerts({ marketId: '' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.notify.alerts({ marketId: 'x'.repeat(65) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
