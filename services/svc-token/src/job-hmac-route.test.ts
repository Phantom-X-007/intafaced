import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { createTokenRouter } from './router.js';
import type { TokenService } from './token-service.js';

const SECRET = 'a-token-job-hmac-route-test-secret-32';
const USER = '11111111-1111-4111-8111-111111111111';
const CONFIRM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RUN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WINDOW = { from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z' };
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-token' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['admin:treasury'],
    tier: 'full',
    mfa: true,
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

function jobCaller() {
  return { ...signed(), service: 'svc-token' as const };
}

function stubToken(): TokenService {
  return {
    mintEpoch: vi.fn(async (epoch: number) => ({ epoch, minted: amt('68000') })),
    mintNextEpoch: vi.fn(async () => ({ epoch: 0, minted: amt('136000') })),
    distributeRevenue: vi.fn(async () => ({
      windowId: 'w1',
      distributed: amt('100'),
      recipients: 1,
      skipped: 0,
      alreadyPaid: 0,
    })),
    recordBuyback: vi.fn(async () => ({
      runId: RUN,
      burned: amt('50'),
      toRewards: amt('50'),
    })),
  } as unknown as TokenService;
}

const runYieldWindow = vi.fn(async () => ({
  windowId: 'w1',
  distributed: amt('55'),
  recipients: 1,
  skipped: 0,
  alreadyPaid: 0,
}));

const runBuybackWindow = vi.fn(async () => ({
  runId: RUN,
  tokensBought: amt('10'),
  burned: amt('6'),
  toRewards: amt('4'),
}));

function router() {
  return createTokenRouter(stubToken(), { runYieldWindow, runBuybackWindow });
}

describe('token job tRPC HMAC as svc-token', () => {
  it('mintEpoch session admin:treasury (no HMAC) is UNAUTHORIZED', async () => {
    await expect(router().createCaller(signed()).mintEpoch({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('yield.runWindow session admin:treasury (no HMAC) is UNAUTHORIZED', async () => {
    await expect(router().createCaller(signed()).yield.runWindow({ windowId: 'w1' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('buyback.runWindow session admin:treasury (no HMAC) is UNAUTHORIZED', async () => {
    await expect(router().createCaller(signed()).buyback.runWindow({ runId: RUN, revenueWindow: WINDOW })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('mintEpoch HMAC as svc-trade is FORBIDDEN', async () => {
    await expect(
      router()
        .createCaller({ ...signed(), service: 'svc-trade' })
        .mintEpoch({}),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('yield.runWindow HMAC as svc-trade is FORBIDDEN', async () => {
    await expect(
      router()
        .createCaller({ ...signed(), service: 'svc-trade' })
        .yield.runWindow({ windowId: 'w1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('buyback.runWindow HMAC as svc-trade is FORBIDDEN', async () => {
    await expect(
      router()
        .createCaller({ ...signed(), service: 'svc-trade' })
        .buyback.runWindow({ runId: RUN, revenueWindow: WINDOW }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('mintEpoch HMAC as svc-token reaches the job', async () => {
    await expect(router().createCaller(jobCaller()).mintEpoch({})).resolves.toMatchObject({ epoch: 0, minted: '136000' });
  });

  it('yield.runWindow HMAC as svc-token reaches the job', async () => {
    await expect(router().createCaller(jobCaller()).yield.runWindow({ windowId: 'w1' })).resolves.toMatchObject({
      windowId: 'w1',
      distributed: '55',
    });
  });

  it('buyback.runWindow HMAC as svc-token reaches the job', async () => {
    await expect(router().createCaller(jobCaller()).buyback.runWindow({ runId: RUN, revenueWindow: WINDOW })).resolves.toMatchObject({
      runId: RUN,
      burned: '6',
    });
  });

  it('distributeRevenue stays session admin:treasury dual-control', async () => {
    await expect(
      router()
        .createCaller(signed())
        .distributeRevenue({ windowId: 'w1', sources: [{ module: 'trade', amount: '100' }], confirmOperatorId: CONFIRM }),
    ).resolves.toMatchObject({ windowId: 'w1', distributed: '100', confirmOperatorId: CONFIRM });
  });

  it('recordBuyback stays session admin:treasury dual-control', async () => {
    await expect(
      router()
        .createCaller(signed())
        .recordBuyback({
          runId: RUN,
          revenueWindow: WINDOW,
          revenueTotal: { IFC: '1000' },
          tokensBought: '100',
          confirmOperatorId: CONFIRM,
        }),
    ).resolves.toMatchObject({ runId: RUN, burned: '50', confirmOperatorId: CONFIRM });
  });
});
