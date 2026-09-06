/**
 * Unit card — studio.list refuses unpublished page size (never invent 50)
 *
 * 1. Promise: omit / NaN / 0 throws quant.studio_list_limit_unset. Owner-explicit 50
 *    still pages. Zod still caps 1..50.
 * 2. Break: studio.list with no page size dumps every saved strategy.
 * 3. Done bar: unset throws QuantError quant.studio_list_limit_unset; 50 is allowed
 * 4. Class N
 * 5. Paths: services/svc-quant/src/studio/list-limit.ts, router.ts
 *
 * Store.list remains the in-process book — not recut here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEdgeContext } from '@intafaced/contracts';
import { QUANT_STUDIO_LIST_LIMIT_UNSET, QuantError } from '../errors.js';
import { createQuantRouter } from '../router.js';
import { assertStudioListLimit, STUDIO_LIST_LIMIT_CAP } from './list-limit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SECRET = 'a-quant-studio-list-limit-test-edge-secret-long-enough';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-quant' });
const anonymous = () => edgeContext({ headers: { 'x-intafaced-region': 'DE' }, id: 'req-anon' });
const limits = { maxOps: 5_000, maxSource: 8_000 };
const risk = { maxDrawdown: '500', maxNotional: '10000', kill: '100' };
const blocks = [{ side: 'buy' as const, symbol: 'BTC-USD', qty: '0.01' }];

describe('assertStudioListLimit', () => {
  it('refuses blank / NaN / 0 — never invents 50', () => {
    expect(() => assertStudioListLimit(undefined)).toThrow(QuantError);
    expect(() => assertStudioListLimit(null)).toThrow(QuantError);
    expect(() => assertStudioListLimit(Number.NaN)).toThrow(QuantError);
    expect(() => assertStudioListLimit(0)).toThrow(QuantError);
    try {
      assertStudioListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(QuantError);
      expect((e as QuantError).code).toBe(QUANT_STUDIO_LIST_LIMIT_UNSET);
      expect((e as QuantError).message).toMatch(/never invent 50/);
      expect((e as QuantError).message).not.toMatch(/default 50|50-row/i);
    }
  });

  it('owner-explicit 50 is allowed and caps at 50', () => {
    expect(assertStudioListLimit(50)).toBe(50);
    expect(assertStudioListLimit(1)).toBe(1);
    expect(assertStudioListLimit(STUDIO_LIST_LIMIT_CAP)).toBe(STUDIO_LIST_LIMIT_CAP);
    expect(assertStudioListLimit(STUDIO_LIST_LIMIT_CAP + 1)).toBe(STUDIO_LIST_LIMIT_CAP);
  });
});

describe('studio.list limit unset refuse', () => {
  it('router does not dump strategies when studio.list omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-quant/src/router.ts'), 'utf8');
    const start = src.indexOf('list: publicJurisdictionProcedure');
    const end = src.indexOf('backtest: router({', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertStudioListLimit(input?.limit)');
    expect(fn).toContain('limit: z.number().int().min(1).max(STUDIO_LIST_LIMIT_CAP).optional()');
    expect(fn).toContain('.slice(0, limit)');
    expect(fn).not.toMatch(/\?\? 50/);
    expect(fn).not.toMatch(/limit = 50/);
    expect(fn).not.toMatch(/strategies: \[\.\.\.studio\.list\(\)\]/);
  });

  it('omit / empty input refuses PRECONDITION_FAILED — never dumps both saves', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await caller.studio.save({ name: 'alpha', blocks, risk, cash: '10000', environment: 'paper' });
    await caller.studio.save({ name: 'beta', blocks, risk, cash: '10000', environment: 'paper' });

    await expect(caller.studio.list()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining(QUANT_STUDIO_LIST_LIMIT_UNSET),
    });
    await expect(caller.studio.list({})).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('never invent 50'),
    });

    const page = await caller.studio.list({ limit: 1 });
    expect(page.strategies).toHaveLength(1);

    const explicit50 = await caller.studio.list({ limit: 50 });
    expect(explicit50.strategies).toHaveLength(2);
  });
});
