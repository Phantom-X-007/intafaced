import { describe, expect, it, vi } from 'vitest';
import { MemoryLedger, formatAmount, houseFees, parseAmount as amt, recipes, type Amount } from '@intafaced/ledger-client';
import { TokenError } from './token-service.js';
import { YIELD_SOURCE_MODULES, readYieldDistributionCronHours, runYieldWindow, type YieldJobDeps } from './yield-job.js';

async function seedFee(ledger: MemoryLedger, module: string, amount: string): Promise<void> {
  const payer = '99999999-9999-4999-8999-999999999999';
  await ledger.post(
    recipes.deposit({
      userId: payer,
      assetId: 'IFC',
      amount: amt(amount),
      rail: 'test',
      railRef: `${module}:${amount}:${Math.random()}`,
    }),
  );
  await ledger.post(
    recipes.feeCharge({
      chargeId: `${module}:${Math.random()}`,
      userId: payer,
      module,
      mode: 'asset',
      assetId: 'IFC',
      amount: amt(amount),
    }),
  );
}

function deps(overrides: Partial<YieldJobDeps> & { ledger: MemoryLedger }): YieldJobDeps {
  return {
    yieldJobEnabled: true,
    yieldDistributionCronHours: 168,
    assetId: 'IFC',
    distributeRevenue: vi.fn(async (input) => ({
      windowId: input.windowId,
      distributed: input.sources.reduce((acc: Amount, s: { amount: Amount }) => acc + s.amount, 0n),
      recipients: 1,
      skipped: 0,
      alreadyPaid: 0,
    })),
    ...overrides,
  };
}

describe('runYieldWindow', () => {
  it('refuses when the job is unset — never reads pots, never distributes', async () => {
    const ledger = new MemoryLedger();
    const d = deps({ ledger, yieldJobEnabled: false });
    const balance = vi.spyOn(ledger, 'balance');

    await expect(runYieldWindow(d, { windowId: 'w-off' })).rejects.toMatchObject({
      name: 'TokenError',
      code: 'token.yield_job_unset',
    });
    expect(d.distributeRevenue).not.toHaveBeenCalled();
    expect(balance).not.toHaveBeenCalled();
  });

  it('refuses caller-typed sources[] — amounts are not an input', async () => {
    const ledger = new MemoryLedger();
    const d = deps({ ledger });
    await expect(
      runYieldWindow(d, { windowId: 'w-typed', sources: [{ module: 'trade', amount: amt('999') }] } as never),
    ).rejects.toMatchObject({ name: 'TokenError', code: 'token.yield_job_unset' });
    expect(d.distributeRevenue).not.toHaveBeenCalled();
  });

  it('reads houseFees per known module and forwards those balances as sources', async () => {
    const ledger = new MemoryLedger();
    await seedFee(ledger, 'trade', '40');
    await seedFee(ledger, 'pay', '15');
    const d = deps({ ledger });

    const result = await runYieldWindow(d, { windowId: 'w-read' });
    expect(formatAmount(result.distributed)).toBe('55');
    expect(d.distributeRevenue).toHaveBeenCalledOnce();
    expect(d.distributeRevenue).toHaveBeenCalledWith({
      windowId: 'w-read',
      sources: [
        { module: 'pay', amount: amt('15') },
        { module: 'trade', amount: amt('40') },
      ],
    });
    expect(formatAmount((await ledger.balance(houseFees('trade', 'IFC'))).amount)).toBe('40');
  });

  it('skips empty pots and refuses when every known module is empty — no invented total', async () => {
    const ledger = new MemoryLedger();
    const d = deps({ ledger });
    await expect(runYieldWindow(d, { windowId: 'w-empty' })).rejects.toBeInstanceOf(TokenError);
    await expect(runYieldWindow(d, { windowId: 'w-empty' })).rejects.toMatchObject({
      code: 'token.nothing_to_distribute',
    });
    expect(d.distributeRevenue).not.toHaveBeenCalled();
  });

  it('known modules are the closed fee-module set — not an operator list', () => {
    expect([...YIELD_SOURCE_MODULES]).toEqual(['bank', 'market', 'p2p', 'pay', 'trade']);
  });

  it('refuses when cron hours are unset — never invents 168', async () => {
    const ledger = new MemoryLedger();
    const d = deps({ ledger, yieldDistributionCronHours: undefined });
    const balance = vi.spyOn(ledger, 'balance');
    await expect(runYieldWindow(d, { windowId: 'w-hours' })).rejects.toMatchObject({
      name: 'TokenError',
      code: 'token.yield_job_unset',
    });
    expect(d.distributeRevenue).not.toHaveBeenCalled();
    expect(balance).not.toHaveBeenCalled();
  });
});

describe('readYieldDistributionCronHours', () => {
  it('blank / missing / garbage is unset — 168 is only owner-present', () => {
    expect(readYieldDistributionCronHours(undefined)).toBeUndefined();
    expect(readYieldDistributionCronHours('')).toBeUndefined();
    expect(readYieldDistributionCronHours('  ')).toBeUndefined();
    expect(readYieldDistributionCronHours('0')).toBeUndefined();
    expect(readYieldDistributionCronHours('168.0')).toBeUndefined();
    expect(readYieldDistributionCronHours('weekly')).toBeUndefined();
    expect(readYieldDistributionCronHours('168')).toBe(168);
    expect(readYieldDistributionCronHours('24')).toBe(24);
  });
});
