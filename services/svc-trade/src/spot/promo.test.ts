/**
 * CARD R-promo — create-promo mill (budget/end refuse; no invented rebate bps).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROMO_BUDGET_ENV,
  PROMO_BUDGET_UNSET,
  PROMO_END_ENV,
  PROMO_END_UNSET,
  PROMO_IEEE,
  checkCreatePromo,
  promoOwnerEnvComposeWired,
} from './promo.js';

const here = dirname(fileURLToPath(import.meta.url));

const SOCKETS = [PROMO_BUDGET_ENV, PROMO_END_ENV] as const;

const previous: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  for (const key of SOCKETS) previous[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of SOCKETS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

function clearSockets(): void {
  for (const key of SOCKETS) delete process.env[key];
}

describe('R-promo create-promo mill — budget/end refuse by name', () => {
  snapshotEnv();
  afterEach(restoreEnv);

  it('blank budget refuses before inventing an end or rebate', () => {
    clearSockets();
    expect(checkCreatePromo({})).toEqual({
      ok: false,
      code: PROMO_BUDGET_UNSET,
      reason: 'TRADE_PROMO_BUDGET is unset — refuse create-promo rather than invent a budget',
      created: false,
      posted: false,
      rebateBps: null,
    });
    expect(checkCreatePromo({ end: '2026-12-31T00:00:00.000Z', rebateBps: '10' })).toMatchObject({
      ok: false,
      code: PROMO_BUDGET_UNSET,
      rebateBps: null,
    });
  });

  it('budget without end refuses — never invents a sunset', () => {
    clearSockets();
    expect(checkCreatePromo({ budget: '1000.00' })).toMatchObject({
      ok: false,
      code: PROMO_END_UNSET,
      created: false,
      rebateBps: null,
    });
    expect(checkCreatePromo({ budget: '1000.00', end: '  ' })).toMatchObject({
      ok: false,
      code: PROMO_END_UNSET,
    });
  });

  it('IEEE budget or rebate bps refuse — never a JS number on the wire', () => {
    clearSockets();
    expect(checkCreatePromo({ budget: 1000, end: '2026-12-31T00:00:00.000Z' })).toMatchObject({
      ok: false,
      code: PROMO_IEEE,
      rebateBps: null,
    });
    expect(checkCreatePromo({ budget: '1000', end: '2026-12-31T00:00:00.000Z', rebateBps: 10 })).toMatchObject({
      ok: false,
      code: PROMO_IEEE,
      rebateBps: null,
    });
  });

  it('absent funding grants no rebate even when bps are offered', () => {
    clearSockets();
    const result = checkCreatePromo({
      budget: '0',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: '10',
    });
    expect(result).toEqual({
      ok: true,
      preview: true,
      created: false,
      posted: false,
      funded: false,
      budget: '0',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: null,
    });
  });

  it('funded budget+end preview — rebate only if owner string, never invented 10/20', () => {
    clearSockets();
    const withoutBps = checkCreatePromo({
      budget: '1000.00',
      end: '2026-12-31T00:00:00.000Z',
    });
    expect(withoutBps).toEqual({
      ok: true,
      preview: true,
      created: false,
      posted: false,
      funded: true,
      budget: '1000',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: null,
    });
    const withBps = checkCreatePromo({
      budget: '1000.00',
      end: '2026-12-31T00:00:00.000Z',
      rebateBps: '25',
    });
    expect(withBps).toMatchObject({ ok: true, funded: true, rebateBps: '25', created: false });
  });

  it('reads owner env when input omits sockets', () => {
    process.env[PROMO_BUDGET_ENV] = '50.00';
    process.env[PROMO_END_ENV] = '2027-01-01T00:00:00.000Z';
    expect(checkCreatePromo({})).toMatchObject({
      ok: true,
      budget: '50',
      end: '2027-01-01T00:00:00.000Z',
      created: false,
      rebateBps: null,
    });
  });
});

describe('R-promo hitch — no recipe, no router recut, compose empty', () => {
  it('mill does not post recipes or invent rebate bps', () => {
    const mill = readFileSync(join(here, 'promo.ts'), 'utf8');
    expect(mill).not.toMatch(/recipes\./);
    expect(mill).not.toMatch(/makerRebateBps:\s*10|makerRebateBps:\s*20/);
    expect(mill).toMatch(/TRADE_PROMO_BUDGET/);
    expect(mill).toMatch(/decimal strings/);
  });

  it('router.ts not recut; index.ts mounts the door', () => {
    const routerSrc = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    const indexSrc = readFileSync(join(here, '..', 'index.ts'), 'utf8');
    expect(routerSrc).not.toMatch(/promo-rest|checkCreatePromo|TRADE_PROMO_|CREATE_PROMO/);
    expect(indexSrc).toContain('registerPromoRest');
  });

  it('compose passes budget/end with empty default', () => {
    expect(promoOwnerEnvComposeWired()).toBe(true);
  });

  it('env schema defaults the two sockets empty — never invents a budget', () => {
    const envSrc = readFileSync(join(here, '..', 'env.ts'), 'utf8');
    expect(envSrc).toMatch(/TRADE_PROMO_BUDGET:\s*z\.string\(\)\.default\(''\)/);
    expect(envSrc).toMatch(/TRADE_PROMO_END:\s*z\.string\(\)\.default\(''\)/);
  });
});
