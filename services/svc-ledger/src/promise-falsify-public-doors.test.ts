import { issueAccessToken } from '@intafaced/auth';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';
import {
  LedgerError,
  MemoryLedger,
  formatAmount,
  loanCollateralAccount,
  loanReserve,
  orderHoldAccount,
  parseAmount as amt,
  recipes,
  userAvailable,
  withdrawalHoldAccount,
  type PostRequest,
} from '@intafaced/ledger-client';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerOperatorHttp } from './operator-http.js';
import { registerS2sHttp } from './s2s-http.js';
import type { LedgerService } from './service.js';

/**
 * D26-P2-01c — PROMISE-FALSIFY THE DOORS, NOT THE PURE FUNCTIONS.
 *
 * Every recipe below enters through the mounted, body-bound S2S HTTP route and
 * every observation leaves through the mounted balance routes. The operator
 * freeze crosses its separately-authenticated HTTP door and must stop the same
 * posting door. Removing a recipe from the public package export, dropping
 * purpose from the wire, mounting the wrong route, or softening a freeze makes
 * this named suite fail while recipe-only tests could remain green.
 */

const USER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE_SECRET = 'promise-falsify-ledger-service-secret';
const TOKENS = {
  secret: 'promise-falsify-ledger-operator-secret',
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

/**
 * Real ledger-client reference engine with only the database-owned freeze row
 * replaced. Post, account identity, idempotency, balancing, and recipes remain
 * production code; a unit test must not need Postgres to prove mounted routes.
 */
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

describe('promise-falsify public doors — svc-ledger + ledger-client (D26-P2-01c)', () => {
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
        ...serviceAuthHeadersForBody('svc-bank', SERVICE_SECRET, payload),
      },
      payload,
    });
  }

  async function serviceRead(path: '/trpc/balance' | '/trpc/balances', body: unknown) {
    const payload = JSON.stringify(body);
    return app.inject({
      method: 'POST',
      url: path,
      headers: {
        'content-type': 'application/json',
        ...serviceAuthHeadersForBody('svc-bank', SERVICE_SECRET, payload),
      },
      payload,
    });
  }

  async function operatorBearer(): Promise<string> {
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
    return `Bearer ${token}`;
  }

  it('keeps order and withdrawal recipe pots separate across post and balances doors', async () => {
    expect(
      (
        await servicePost(
          recipes.deposit({
            userId: USER,
            assetId: 'USDT',
            amount: amt('30'),
            rail: 'test',
            railRef: 'purpose-seed',
          }),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await servicePost(
          recipes.orderHold({
            orderId: 'order-door-1',
            userId: USER,
            assetId: 'USDT',
            amount: amt('10'),
          }),
        )
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await servicePost(
          recipes.withdrawHold({
            withdrawalId: 'withdraw-door-1',
            userId: USER,
            assetId: 'USDT',
            amount: amt('7'),
            rail: 'test',
          }),
        )
      ).statusCode,
    ).toBe(200);

    const balances = await serviceRead('/trpc/balances', { ownerType: 'user', ownerId: USER });
    expect(balances.statusCode).toBe(200);
    expect(balances.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'available', purpose: '', amount: '13' }),
        expect.objectContaining({ kind: 'hold', purpose: 'order:order-door-1', amount: '10' }),
        expect.objectContaining({ kind: 'hold', purpose: 'withdraw:withdraw-door-1', amount: '7' }),
      ]),
    );

    expect(
      (
        await servicePost(
          recipes.withdrawReverse({
            withdrawalId: 'withdraw-door-1',
            userId: USER,
            assetId: 'USDT',
            amount: amt('7'),
            rail: 'test',
          }),
        )
      ).statusCode,
    ).toBe(200);
    const reversed = await serviceRead('/trpc/balance', withdrawalHoldAccount(USER, 'USDT', 'withdraw-door-1'));
    const order = await serviceRead('/trpc/balance', orderHoldAccount(USER, 'USDT', 'order-door-1'));
    expect(reversed.json()).toMatchObject({ purpose: 'withdraw:withdraw-door-1', amount: '0' });
    expect(order.json()).toMatchObject({ purpose: 'order:order-door-1', amount: '10' });
  });

  it('halts new recipes at the operator freeze door and resumes only through authenticated unfreeze', async () => {
    const first = recipes.deposit({
      userId: USER,
      assetId: 'USDT',
      amount: amt('5'),
      rail: 'test',
      railRef: 'before-freeze',
    });
    expect((await servicePost(first)).statusCode).toBe(200);

    const authorization = await operatorBearer();
    const frozen = await app.inject({
      method: 'POST',
      url: '/operator/freeze',
      headers: { authorization },
      payload: { reason: 'promise-falsify reconciliation drift' },
    });
    expect(frozen.statusCode).toBe(200);
    expect(frozen.json()).toMatchObject({
      frozen: true,
      reason: 'promise-falsify reconciliation drift',
      actor: OPERATOR,
    });

    const blocked = recipes.deposit({
      userId: USER,
      assetId: 'USDT',
      amount: amt('9'),
      rail: 'test',
      railRef: 'while-frozen',
    });
    const refusal = await servicePost(blocked);
    expect(refusal.statusCode).toBe(412);
    expect(refusal.json()).toMatchObject({ code: 'ledger.frozen' });
    expect((await serviceRead('/trpc/balance', userAvailable(USER, 'USDT'))).json()).toMatchObject({ amount: '5' });

    const thawed = await app.inject({
      method: 'POST',
      url: '/operator/unfreeze',
      headers: { authorization },
    });
    expect(thawed.statusCode).toBe(200);
    expect(thawed.json()).toMatchObject({ frozen: false, reason: null, actor: OPERATOR });
    expect((await servicePost(blocked)).statusCode).toBe(200);
    expect((await serviceRead('/trpc/balance', userAvailable(USER, 'USDT'))).json()).toMatchObject({ amount: '14' });
  });

  it('locks, draws, and releases loan recipes without commingling collateral', async () => {
    const setup = [
      recipes.deposit({
        userId: USER,
        assetId: 'BTC',
        amount: amt('2'),
        rail: 'test',
        railRef: 'loan-collateral',
      }),
      recipes.deposit({
        userId: USER,
        assetId: 'USDT',
        amount: amt('1000'),
        rail: 'test',
        railRef: 'loan-reserve-cash',
      }),
      recipes.feeCharge({
        chargeId: 'loan-reserve-fee',
        userId: USER,
        module: 'bank',
        mode: 'asset',
        assetId: 'USDT',
        amount: amt('1000'),
      }),
      recipes.loanReserveFund({
        fundingId: 'loan-door-fund',
        debtAssetId: 'USDT',
        amount: amt('1000'),
      }),
      recipes.loanCollateralLock({
        loanId: 'loan-door-a',
        userId: USER,
        collateralAssetId: 'BTC',
        amount: amt('1'),
        sequence: 0,
      }),
      recipes.loanCollateralLock({
        loanId: 'loan-door-b',
        userId: USER,
        collateralAssetId: 'BTC',
        amount: amt('1'),
        sequence: 0,
      }),
      recipes.loanDraw({
        loanId: 'loan-door-a',
        userId: USER,
        debtAssetId: 'USDT',
        principal: amt('1000'),
      }),
      recipes.loanCollateralRelease({
        loanId: 'loan-door-a',
        userId: USER,
        collateralAssetId: 'BTC',
        amount: amt('1'),
        sequence: 1,
      }),
    ];

    for (const request of setup) {
      const response = await servicePost(request);
      expect(response.statusCode, `${request.reason}: ${response.body}`).toBe(200);
    }

    const loanA = await serviceRead('/trpc/balance', loanCollateralAccount(USER, 'BTC', 'loan-door-a'));
    const loanB = await serviceRead('/trpc/balance', loanCollateralAccount(USER, 'BTC', 'loan-door-b'));
    const reserve = await serviceRead('/trpc/balance', loanReserve('USDT'));
    const borrowerDebtAsset = await serviceRead('/trpc/balance', userAvailable(USER, 'USDT'));

    expect(loanA.json()).toMatchObject({ kind: 'collateral', purpose: 'loan:loan-door-a', amount: '0' });
    expect(loanB.json()).toMatchObject({ kind: 'collateral', purpose: 'loan:loan-door-b', amount: '1' });
    expect(reserve.json()).toMatchObject({ amount: '0' });
    expect(borrowerDebtAsset.json()).toMatchObject({ amount: '1000' });
  });
});
