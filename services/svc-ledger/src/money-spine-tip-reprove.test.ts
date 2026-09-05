/**
 * D26-P2-12 — tip re-prove of the ledger money doors on the matching spine.
 *
 * D26-P2-01c already promise-falsified purpose / freeze / loan recipes. This
 * suite re-proves the trade money path that matching assumes stays honest:
 * deposit → orderHold → tradeFill through the mounted body-bound S2S door,
 * with balance observations also through that door. Softening body-bind,
 * dropping tradeFill from the public recipe surface, or letting freeze fail
 * open mid-spine fails here while pure recipe unit tests could stay green.
 *
 * Class: N (honesty). Leverage: registerS2sHttp + registerOperatorHttp +
 * MemoryLedger / ledger-client recipes (Phase A — no second book).
 */
import { issueAccessToken } from '@intafaced/auth';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import {
  LedgerError,
  MemoryLedger,
  formatAmount,
  houseFees,
  orderHoldAccount,
  parseAmount as amt,
  recipes,
  userAvailable,
  type PostRequest,
} from '@intafaced/ledger-client';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerOperatorHttp } from './operator-http.js';
import { registerS2sHttp } from './s2s-http.js';
import type { LedgerService } from './service.js';

const MAKER = '11111111-1111-4111-8111-111111111111';
const TAKER = '22222222-2222-4222-8222-222222222222';
const OPERATOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONFIRM = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SERVICE_SECRET = 'ledger-money-spine-tip-reprove-secret';
const TOKENS = {
  secret: 'ledger-money-spine-tip-reprove-operator',
  issuer: 'intafaced',
  audience: 'intafaced.api',
  accessTtlSeconds: 900,
};

type FreezeState = {
  frozen: boolean;
  reason: string | null;
  actor: string | null;
  changedAt: Date;
  changedAtPrecise: string;
};

class PublicDoorLedger {
  readonly engine = new MemoryLedger();
  private state: FreezeState = this.snapshot(false, null, null);

  async post(request: PostRequest) {
    const existing = await this.engine.getTxByKey(request.idempotencyKey);
    if (existing) return existing;
    if (this.state.frozen) {
      throw new LedgerError(`Ledger posting is frozen: ${this.state.reason ?? 'operator freeze'}`, 'ledger.frozen');
    }
    return this.engine.post(request);
  }

  balance = this.engine.balance.bind(this.engine);
  balances = this.engine.balances.bind(this.engine);
  getTx = this.engine.getTx.bind(this.engine);
  getTxByKey = this.engine.getTxByKey.bind(this.engine);

  async freeze(reason: string, actor: string): Promise<FreezeState> {
    this.state = this.snapshot(true, reason, actor);
    return this.state;
  }

  async unfreeze(actor: string): Promise<FreezeState> {
    this.state = this.snapshot(false, null, actor);
    return this.state;
  }

  async freezeState(): Promise<FreezeState> {
    return this.state;
  }

  private snapshot(frozen: boolean, reason: string | null, actor: string | null): FreezeState {
    const changedAt = new Date();
    return { frozen, reason, actor, changedAt, changedAtPrecise: changedAt.toISOString() };
  }
}

function wirePost(request: PostRequest): string {
  return JSON.stringify({
    ...request,
    entries: request.entries.map((entry) => ({
      account: entry.account,
      direction: entry.direction,
      amount: formatAmount(entry.amount),
    })),
  });
}

describe('D26-P2-12 tip re-prove — ledger money doors (tradeFill spine)', () => {
  let app: FastifyInstance;
  let ledger: PublicDoorLedger;

  beforeEach(async () => {
    ledger = new PublicDoorLedger();
    app = Fastify({ logger: false });
    registerS2sHttp(app, ledger as unknown as LedgerService, SERVICE_SECRET, { bodyBind: 'require' });
    registerOperatorHttp(app, ledger as unknown as LedgerService, TOKENS);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function servicePost(request: PostRequest) {
    const payload = wirePost(request);
    return app.inject({
      method: 'POST',
      url: '/trpc/post',
      headers: {
        'content-type': 'application/json',
        ...serviceAuthHeadersForBody('svc-trade', SERVICE_SECRET, payload),
      },
      payload,
    });
  }

  async function serviceBalance(account: unknown) {
    const payload = JSON.stringify(account);
    return app.inject({
      method: 'POST',
      url: '/trpc/balance',
      headers: {
        'content-type': 'application/json',
        ...serviceAuthHeadersForBody('svc-trade', SERVICE_SECRET, payload),
      },
      payload,
    });
  }

  async function fundSpineHolds() {
    const setup = [
      recipes.deposit({
        userId: TAKER,
        assetId: 'USDT',
        amount: amt('1000'),
        rail: 'test',
        railRef: 'spine-taker-usdt',
      }),
      recipes.deposit({
        userId: MAKER,
        assetId: 'BTC',
        amount: amt('2'),
        rail: 'test',
        railRef: 'spine-maker-btc',
      }),
      recipes.orderHold({
        orderId: 'taker-spine-1',
        userId: TAKER,
        assetId: 'USDT',
        amount: amt('900'),
      }),
      recipes.orderHold({
        orderId: 'maker-spine-1',
        userId: MAKER,
        assetId: 'BTC',
        amount: amt('1'),
      }),
    ];
    for (const request of setup) {
      const response = await servicePost(request);
      expect(response.statusCode, `${request.reason}: ${response.body}`).toBe(200);
    }
  }

  const fill = () =>
    recipes.tradeFill({
      fillId: 'spine-tip-f1',
      makerId: MAKER,
      takerId: TAKER,
      makerOrderId: 'maker-spine-1',
      takerOrderId: 'taker-spine-1',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      qty: amt('1'),
      quoteAmount: amt('900'),
      takerSide: 'buy',
      makerFeeBps: 10,
      takerFeeBps: 20,
    });

  it('posts tradeFill through the S2S door and balances prove holds cleared + house fees', async () => {
    await fundSpineHolds();

    const posted = await servicePost(fill());
    expect(posted.statusCode).toBe(200);
    expect(posted.json()).toMatchObject({ txId: expect.any(String), hash: expect.any(String) });

    expect((await serviceBalance(userAvailable(MAKER, 'USDT'))).json()).toMatchObject({ amount: '899.1' });
    expect((await serviceBalance(userAvailable(TAKER, 'BTC'))).json()).toMatchObject({ amount: '0.998' });
    expect((await serviceBalance(houseFees('trade', 'USDT'))).json()).toMatchObject({ amount: '0.9' });
    expect((await serviceBalance(houseFees('trade', 'BTC'))).json()).toMatchObject({ amount: '0.002' });
    expect((await serviceBalance(orderHoldAccount(TAKER, 'USDT', 'taker-spine-1'))).json()).toMatchObject({
      purpose: 'order:taker-spine-1',
      amount: '0',
    });
    expect((await serviceBalance(orderHoldAccount(MAKER, 'BTC', 'maker-spine-1'))).json()).toMatchObject({
      purpose: 'order:maker-spine-1',
      amount: '0',
    });
  });

  it('retried tradeFill through the door moves value once', async () => {
    await fundSpineHolds();
    const first = await servicePost(fill());
    const second = await servicePost(fill());
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().txId).toBe(first.json().txId);
    expect(second.json().hash).toBe(first.json().hash);

    expect((await serviceBalance(userAvailable(MAKER, 'USDT'))).json()).toMatchObject({ amount: '899.1' });
    expect((await serviceBalance(houseFees('trade', 'USDT'))).json()).toMatchObject({ amount: '0.9' });
  });

  it('freeze after holds blocks tradeFill at the door and leaves pots untouched', async () => {
    await fundSpineHolds();

    const { token } = await issueAccessToken(
      {
        userId: OPERATOR,
        sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        scopes: ['admin:treasury'],
        tier: 'basic',
        mfa: true,
      },
      TOKENS,
    );
    const frozen = await app.inject({
      method: 'POST',
      url: '/operator/freeze',
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'spine tip re-prove mid-fill halt', confirmOperatorId: CONFIRM },
    });
    expect(frozen.statusCode).toBe(200);

    const refusal = await servicePost(fill());
    expect(refusal.statusCode).toBe(412);
    expect(refusal.json()).toMatchObject({ code: 'ledger.frozen' });

    expect((await serviceBalance(orderHoldAccount(TAKER, 'USDT', 'taker-spine-1'))).json()).toMatchObject({
      amount: '900',
    });
    expect((await serviceBalance(orderHoldAccount(MAKER, 'BTC', 'maker-spine-1'))).json()).toMatchObject({
      amount: '1',
    });
    expect((await serviceBalance(houseFees('trade', 'USDT'))).json()).toMatchObject({ amount: '0' });
  });

  it('anonymous post never reaches the book', async () => {
    const payload = wirePost(
      recipes.deposit({
        userId: TAKER,
        assetId: 'USDT',
        amount: amt('1'),
        rail: 'test',
        railRef: 'anon-spine',
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/trpc/post',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect((await serviceBalance(userAvailable(TAKER, 'USDT'))).json()).toMatchObject({ amount: '0' });
  });
});
