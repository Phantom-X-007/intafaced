/**
 * Done-bar — trade.copy auto-mirror place socket (SOCKET §13).
 *
 * Breaks caught:
 *   · planMirror succeeds but placeMirror invents a spot fill / order id;
 *   · deskStatus omits the open socket so residual looks closed;
 *   · placeMirror without a prior plan returns a fake success.
 */
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { MemoryLedger } from '@intafaced/ledger-client';
import { describe, expect, it } from 'vitest';
import { createTradeRouter } from '../router.js';
import type { TradeService } from '../spot/trade-service.js';
import { COPY_AUTO_MIRROR_PLACE_SOCKET, CopyService } from './index.js';

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

function makeCopy() {
  return new CopyService(new MemoryLedger(), {
    feeShareLaw: { published: false },
    jurisdictionLaw: { published: true, allowedRegions: ['SG'] },
  });
}

describe('D26-P1-T3 auto-mirror place Done-bar', () => {
  it('deskStatus publishes the §13 socket as refuse-closed', async () => {
    const status = await createTradeRouter({} as TradeService, undefined, makeCopy())
      .createCaller(signed())
      .copy.deskStatus();
    expect(status.autoMirrorPlace.published).toBe(false);
    expect(status.autoMirrorPlace.socket).toBe(COPY_AUTO_MIRROR_PLACE_SOCKET);
    expect(status.residuals.autoMirrorPlace).toContain(COPY_AUTO_MIRROR_PLACE_SOCKET);
  });

  it('planMirror is real; placeMirror refuses by name and never invents a fill', async () => {
    const caller = createTradeRouter({} as TradeService, undefined, makeCopy()).createCaller(signed());

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
    expect(plan.reason).toBe('within_envelope');

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
});
