import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MarketError, assertHistoryLimit } from './vendor-service.js';
import { userCopy } from './user-copy.js';

/**
 * history page size is refuse-closed when unset.
 *
 * history used `limit = 50`, so omit invented a 50-event window.
 * Blank must refuse. Owner/client may pass 50 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('history limit unset refuse', () => {
  it('assertHistoryLimit refuses blank / NaN / 0 — never invents 50', () => {
    expect(() => assertHistoryLimit(undefined)).toThrow(MarketError);
    expect(() => assertHistoryLimit(Number.NaN)).toThrow(MarketError);
    expect(() => assertHistoryLimit(0)).toThrow(MarketError);
    try {
      assertHistoryLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(MarketError);
      expect((e as MarketError).code).toBe('market.history_limit_unset');
      expect((e as MarketError).message).toBe(userCopy('market.history_limit_unset'));
      expect((e as MarketError).message).not.toMatch(/50-event|default 50/i);
    }
  });

  it('accepts owner-published 50 and caps at 200', () => {
    expect(assertHistoryLimit(50)).toBe(50);
    expect(assertHistoryLimit(1)).toBe(1);
    expect(assertHistoryLimit(200)).toBe(200);
    expect(assertHistoryLimit(201)).toBe(200);
  });

  it('history no longer defaults limit to 50', () => {
    const src = readFileSync(join(ROOT, 'services/svc-market/src/vendor-service.ts'), 'utf8');
    const start = src.indexOf('async history(');
    const end = src.indexOf('async openSlotCount(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertHistoryLimit');
    expect(fn).not.toMatch(/limit = 50/);
    expect(fn).not.toMatch(/\?\? 50/);
  });

  it('router does not invent 50 when history omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-market/src/router.ts'), 'utf8');
    const start = src.indexOf('history: scopedProcedure');
    const end = src.indexOf('commerceProgramme:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('vendors.history(input.vendorId, input.limit)');
    expect(fn).not.toMatch(/input\.limit \?\? 50/);
    expect(fn).not.toMatch(/\?\? 50/);
  });
});
