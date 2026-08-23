import { describe, expect, it } from 'vitest';
import { checkAccess } from '@intafaced/config';
import { createEdgeContext } from '@intafaced/contracts';
import {
  QUANT_BACKTEST_FILLS_MISSING,
  QUANT_BACKTEST_LAKE_MISSING,
  QUANT_BACKTEST_WALK_FORWARD_REQUIRED,
  QUANT_SANDBOX_ESCAPE,
  QUANT_SANDBOX_UNWIRED,
  QUANT_STUDIO_RISK_BLOCK_REQUIRED,
  QUANT_VENUE_VAULT_UNSET,
} from './errors.js';
import type { BacktestLake } from './backtest/lake.js';
import { createQuantRouter } from './router.js';

const SECRET = 'a-quant-mount-test-edge-secret-long-enough';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-quant' });
const anonymous = (region = 'DE') => edgeContext({ headers: { 'x-intafaced-region': region }, id: 'req-anon' });

const limits = { maxOps: 5_000, maxSource: 8_000 };

const SAMPLE_JS = `const px = market.last("BTC-USD");
oms.buy("BTC-USD", "0.01");
console.log(px);
console.log(book.cash());
console.log(book.pnl());`;

describe('svc-quant mount — sandbox.run', () => {
  it('serves a five-line javascript run over the wire with decimal-string pnl', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const ran = await caller.sandbox.run({ language: 'javascript', source: SAMPLE_JS, cash: '10000' });
    expect(ran.ok).toBe(true);
    expect(typeof ran.pnl).toBe('string');
    expect(typeof ran.cash).toBe('string');
    expect(ran.fills[0]?.qty).toBe('0.01');
    expect(ran.venue).toBe('internal');
    expect(ran.venueVault).toBe('unset');
  });

  it('serves python the same way', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const ran = await caller.sandbox.run({
      language: 'python',
      source: 'oms.buy("BTC-USD", "0.01")\nprint(book.pnl())',
      cash: '10000',
    });
    expect(ran.pnl).toBe('0');
    expect(ran.logs[0]).toBe('0');
  });

  it('refuses unwired isolate by name, and does not invent pnl', async () => {
    const caller = createQuantRouter({ wired: false, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(caller.sandbox.run({ language: 'javascript', source: SAMPLE_JS, cash: '10000' })).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_SANDBOX_UNWIRED),
    });
  });

  it('refuses a network escape rather than running it', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(
      caller.sandbox.run({ language: 'javascript', source: 'fetch("https://evil.example")', cash: '10000' }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_SANDBOX_ESCAPE),
    });
  });

  it('refuses venue OMS when the vault pin is unset', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(
      caller.sandbox.run({ language: 'javascript', source: 'oms.venueBuy("BTC-USD", "0.01")', cash: '10000' }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_VENUE_VAULT_UNSET),
    });
  });

  it('admits the sandbox without KYC on the fiat paper book', () => {
    const decision = checkAccess({ module: 'quant', plane: 'fiat', region: 'DE', kycTier: 'none' });
    expect(decision.allowed).toBe(true);
  });

  it('reports capabilities without fabricating a vault', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const caps = await caller.sandbox.capabilities();
    expect(caps.isolate).toBe('wired');
    expect(caps.venueVault).toBe('unset');
    expect(caps.languages).toContain('python');
  });
});

describe('svc-quant mount — studio.save', () => {
  const risk = { maxDrawdown: '500', maxNotional: '10000', kill: '100' };
  const blocks = [{ side: 'buy' as const, symbol: 'BTC-USD', qty: '0.01' }];

  it('refuses missing risk block by name and does not persist', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(caller.studio.save({ name: 'alpha', blocks, cash: '10000' })).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_STUDIO_RISK_BLOCK_REQUIRED),
    });
    const listed = await caller.studio.list();
    expect(listed.strategies).toEqual([]);
  });

  it('saves a no-code strategy then runs it through existing sandbox.run', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const saved = await caller.studio.save({ name: 'alpha', blocks, risk, cash: '10000' });
    expect(saved.risk.maxDrawdown).toBe('500');
    expect(typeof saved.risk.maxNotional).toBe('string');
    expect(typeof saved.cash).toBe('string');
    expect('pnl' in saved).toBe(false);
    expect(saved.source).toContain('oms.buy');

    const ran = await caller.sandbox.run({ language: saved.language, source: saved.source, cash: saved.cash });
    expect(ran.ok).toBe(true);
    expect(typeof ran.pnl).toBe('string');
    expect(ran.fills[0]?.qty).toBe('0.01');
  });
});

describe('svc-quant mount — backtest.run', () => {
  const walkForward = {
    inSampleFrom: '2026-01-01T00:00:00.000Z',
    inSampleTo: '2026-04-01T00:00:00.000Z',
    outOfSampleFrom: '2026-04-01T00:00:00.000Z',
    outOfSampleTo: '2026-07-01T00:00:00.000Z',
  };
  const costModel = {
    fees: { kind: 'venue-schedule', source: 'connect:venue-a:fee-schedule:v7' },
    slippage: { kind: 'order-book-replay', source: 'connect:data-lake:venue-a:depth:v3' },
    latency: { kind: 'measured-distribution', source: 'connect:venue-a:round-trip:2026-q2' },
  };
  const lake: BacktestLake = {
    wired: true,
    fills: () => [
      { ts: '2026-02-01T00:00:00.000Z', symbol: 'BTC-USD', qty: '0.01', price: '50000' },
      { ts: '2026-05-01T00:00:00.000Z', symbol: 'BTC-USD', qty: '0.02', price: '51000' },
    ],
  };

  it('refuses missing lake by name', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(
      caller.backtest.run({
        strategyId: 'alpha',
        symbol: 'BTC-USD',
        walkForward,
        outOfSampleStatus: 'passed',
        costModel,
        strategyVariantCount: 1,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining(QUANT_BACKTEST_LAKE_MISSING) });
  });

  it('refuses missing fills by name', async () => {
    const empty: BacktestLake = { wired: true, fills: () => [] };
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits, lake: empty }).createCaller(anonymous());
    await expect(
      caller.backtest.run({
        strategyId: 'alpha',
        symbol: 'BTC-USD',
        walkForward,
        outOfSampleStatus: 'passed',
        costModel,
        strategyVariantCount: 1,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining(QUANT_BACKTEST_FILLS_MISSING) });
  });

  it('refuses missing walk-forward by name', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits, lake }).createCaller(anonymous());
    await expect(
      caller.backtest.run({ strategyId: 'alpha', symbol: 'BTC-USD', outOfSampleStatus: 'passed', costModel, strategyVariantCount: 1 }),
    ).rejects.toMatchObject({ message: expect.stringContaining(QUANT_BACKTEST_WALK_FORWARD_REQUIRED) });
  });

  it('metrics from fills; OOS and cost-model refusals stay named', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits, lake }).createCaller(anonymous());
    await expect(
      caller.backtest.run({ strategyId: 'alpha', symbol: 'BTC-USD', walkForward, costModel, strategyVariantCount: 1 }),
    ).rejects.toMatchObject({ message: expect.stringContaining('missing_out_of_sample_verdict') });

    const ran = await caller.backtest.run({
      strategyId: 'alpha',
      symbol: 'BTC-USD',
      walkForward,
      outOfSampleStatus: 'passed',
      costModel,
      strategyVariantCount: 1,
    });
    expect(ran.ok).toBe(true);
    expect(typeof ran.inSample.notional).toBe('string');
    expect(typeof ran.outOfSample.notional).toBe('string');
    expect(ran.outOfSample.fillCount).toBe(1);
    expect('pnl' in ran).toBe(false);
  });
});
