import { parseAmount } from '@intafaced/ledger-client';
import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { SealedHouseTenantRegistry } from '@intafaced/execution-house-tenant';
import { createExecutionRouter } from './router.js';
import { buildTradeBookSnapshotMap, createTradeBookSnapshotFn, TRADE_BOOK_SNAPSHOT_VENUE_ID } from './trade-book-snapshot.js';

const SECRET = 'a-execution-trade-book-mount-test-edge-secret';
const OP = '33333333-3333-4333-8333-333333333333';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-execution' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: OP,
    userId: OP,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:read', 'admin:write'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function hmacSigned(p: Principal = principal()) {
  return { ...signed(p), service: 'svc-execution' as const };
}

describe('trade book snapshot mount', () => {
  it('buildTradeBookSnapshotMap wires intafaced-spot when TRADE_URL is set', () => {
    const map = buildTradeBookSnapshotMap('http://trade.test');
    expect(Object.keys(map)).toEqual([TRADE_BOOK_SNAPSHOT_VENUE_ID]);
  });

  it('execution.oms.snapshot observes through intafaced-spot trade map', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          symbol: 'BTC/USDT',
          bids: [['42000', '1']],
          asks: [['42001', '2']],
          timestamp: 1_700_000_000_000,
          datetime: '2023-11-14T22:13:20.000Z',
          nonce: 7,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const snapshotByVenue = {
      [TRADE_BOOK_SNAPSHOT_VENUE_ID]: createTradeBookSnapshotFn({
        tradeUrl: 'http://trade.test',
        fetchImpl: fetchImpl as typeof fetch,
      }),
    };

    const caller = createExecutionRouter(
      new SealedHouseTenantRegistry(),
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      snapshotByVenue,
    ).createCaller(hmacSigned());

    const out = await caller.execution.oms.snapshot({
      venueId: TRADE_BOOK_SNAPSHOT_VENUE_ID,
      symbol: 'BTC/USDT',
      kind: 'external-cex',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.snapshot.venueId).toBe(TRADE_BOOK_SNAPSHOT_VENUE_ID);
    expect(out.snapshot.bids).toEqual([[parseAmount('42000'), parseAmount('1')]]);
    expect(out.snapshot.sequence).toBe(7);
  });
});
