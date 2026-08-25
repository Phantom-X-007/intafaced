import { describe, expect, it } from 'vitest';
import { massCancelAccountRefuse, massCancelSessionRefuse, readSessionId, SESSION_UNSUPPORTED } from './matching-client.js';
import { StubMatching } from './testing.js';

describe('stub mass-cancel — owner is accountId', () => {
  it('pulls the owner rest and leaves a stranger', async () => {
    const matching = new StubMatching();
    await matching.submit('m1', {
      orderId: '11111111-1111-4111-8111-111111111111',
      accountId: 'desk',
      type: 'limit',
      side: 'sell',
      qty: '1',
      price: '100',
      tif: 'GTC',
    });
    await matching.submit('m1', {
      orderId: '22222222-2222-4222-8222-222222222222',
      accountId: 'mm',
      type: 'limit',
      side: 'sell',
      qty: '1',
      price: '101',
      tif: 'GTC',
    });

    const result = await matching.massCancel('m1', { accountId: 'desk' });
    expect(result.accepted).toBe(true);
    expect(result.cancellations.map((c) => c.orderId)).toEqual(['11111111-1111-4111-8111-111111111111']);
    const live = await matching.listOrders('m1');
    expect(live.orders.map((o) => o.orderId)).toEqual(['22222222-2222-4222-8222-222222222222']);
  });

  it('missing account and session refuse; foreign claim is not_owner', () => {
    expect(readSessionId({ sessionId: 'sess-1' })).toBe('sess-1');
    expect(massCancelSessionRefuse('sess-1')?.code).toBe(SESSION_UNSUPPORTED);
    expect(massCancelAccountRefuse('', null)?.code).toBe('missing_account');
    expect(massCancelAccountRefuse('desk', 'mm')?.code).toBe('not_owner');
  });
});
