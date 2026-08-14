/**
 * Done-bar — trade.copy auto-mirror place (follower placeOrder wire).
 *
 * Breaks caught:
 *   · unwired port still refuse-closed (never invent a fill);
 *   · wired port places via the port with plan qty/side — never a fabricated fill;
 *   · placeMirror without a prior plan returns a fake success.
 */
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryLedger, formatAmount, parseAmount } from '@intafaced/ledger-client';
import { describe, expect, it } from 'vitest';
import { createTradeRouter } from '../router.js';
import type { TradeService } from '../spot/trade-service.js';
import { COPY_AUTO_MIRROR_PLACE_SOCKET, CopyService, copyMirrorClientOrderId } from './index.js';

const SECRET = 'copy-auto-mirror-place-done-bar-secret-32b';
const FOLLOWER = '11111111-1111-4111-8111-111111111111';
const LEADER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const futureExpiry = '2026-12-01T00:00:00.000Z';

const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-trade' });

function principal(): Principal {
  return {
    sub: FOLLOWER,
    userId: FOLLOWER,
    sid: SESSION,
    scopes: ['trade:read', 'trade:write'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
}

function signed() {
  const raw = encodePrincipal(principal());
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'SG'),
      'x-intafaced-region': 'SG',
    },
    id: 'req-copy-auto-mirror',
  });
}

function laws() {
  return {
    feeShareLaw: { published: false as const },
    jurisdictionLaw: { published: true as const, allowedRegions: ['SG'] },
  };
}

describe('D26-P1-T3 auto-mirror place Done-bar', () => {
  it('unwired deskStatus publishes the §13 socket as refuse-closed', async () => {
    const status = await createTradeRouter({} as TradeService, undefined, new CopyService(new MemoryLedger(), laws()))
      .createCaller(signed())
      .copy.deskStatus();
    expect(status.autoMirrorPlace.published).toBe(false);
    expect(status.autoMirrorPlace.socket).toBe(COPY_AUTO_MIRROR_PLACE_SOCKET);
    expect(status.residuals.autoMirrorPlace).toContain(COPY_AUTO_MIRROR_PLACE_SOCKET);
  });

  it('unwired: planMirror is real; placeMirror refuses and never invents a fill', async () => {
    const caller = createTradeRouter({} as TradeService, undefined, new CopyService(new MemoryLedger(), laws())).createCaller(signed());

    const follow = await caller.copy.follow({
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });

    const plan = await caller.copy.planMirror({
      followId: follow.followId,
      fillId: 'leader-fill-1',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });
    expect(plan.fillId).toBe('leader-fill-1');

    await expect(
      caller.copy.placeMirror({
        followId: follow.followId,
        fillId: plan.fillId,
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });

    await expect(
      caller.copy.placeMirror({
        followId: follow.followId,
        fillId: 'never-planned',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('wired: placeMirror calls follower placeOrder with plan qty — never invents a fill', async () => {
    const placed: { clientOrderId: string; qty: bigint; side: string }[] = [];
    const copy = new CopyService(new MemoryLedger(), {
      ...laws(),
      placeFollowerOrder: async (_p, input) => {
        placed.push({ clientOrderId: input.clientOrderId, qty: input.qty, side: input.side });
        return { orderId: 'ord-follower-1' };
      },
    });
    const caller = createTradeRouter({} as TradeService, undefined, copy).createCaller(signed());

    const follow = await caller.copy.follow({
      leaderId: LEADER,
      region: 'SG',
      permittedMarkets: ['BTC-USDT'],
      maxNotionalPerOrder: '100',
      maxAggregateExposure: '1000',
      expiresAt: futureExpiry,
    });
    await caller.copy.planMirror({
      followId: follow.followId,
      fillId: 'leader-fill-2',
      marketId: 'BTC-USDT',
      side: 'buy',
      qty: '0.01',
      notional: '50',
    });

    const status = await caller.copy.deskStatus();
    expect(status.autoMirrorPlace.published).toBe(true);
    expect(status.residuals.autoMirrorPlace).toBeNull();

    const result = await caller.copy.placeMirror({
      followId: follow.followId,
      fillId: 'leader-fill-2',
    });
    expect(result.orderId).toBe('ord-follower-1');
    expect(result.qty).toBe(formatAmount(parseAmount('0.01')));
    expect(placed).toHaveLength(1);
    expect(placed[0]!.qty).toBe(parseAmount('0.01'));
    expect(placed[0]!.clientOrderId).toBe(copyMirrorClientOrderId(follow.followId, 'leader-fill-2'));
  });
});
