import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { P2pError, assertLateSettlementsListLimit } from './p2p-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

/**
 * ops.lateSettlements page size is refuse-closed when unset.
 *
 * listLateSettlements used `limit = 100` / router `input?.limit ?? 100`, so
 * omit invented a 100-row operator queue. Blank must refuse. Owner/client
 * may pass 100 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('ops.lateSettlements limit unset refuse', () => {
  it('assertLateSettlementsListLimit refuses blank / NaN / 0 — never invents 100', () => {
    expect(() => assertLateSettlementsListLimit(undefined)).toThrow(P2pError);
    expect(() => assertLateSettlementsListLimit(Number.NaN)).toThrow(P2pError);
    expect(() => assertLateSettlementsListLimit(0)).toThrow(P2pError);
    try {
      assertLateSettlementsListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(P2pError);
      expect((e as P2pError).code).toBe('p2p.late_settlements_list_limit_unset');
      expect((e as P2pError).message).toBe(resolveP2pCopy(P2P_COPY.lateSettlementsListLimitUnset));
      expect((e as P2pError).message).not.toMatch(/100-row|default 100/i);
    }
  });

  it('accepts owner-published 100 and caps at 200', () => {
    expect(assertLateSettlementsListLimit(100)).toBe(100);
    expect(assertLateSettlementsListLimit(1)).toBe(1);
    expect(assertLateSettlementsListLimit(200)).toBe(200);
    expect(assertLateSettlementsListLimit(201)).toBe(200);
  });

  it('listLateSettlements no longer defaults limit to 100', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/p2p-service.ts'), 'utf8');
    const start = src.indexOf('async listLateSettlements(');
    const end = src.indexOf('async getTrade(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertLateSettlementsListLimit');
    expect(fn).not.toMatch(/limit = 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });

  it('router does not invent 100 when ops.lateSettlements omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/router.ts'), 'utf8');
    const start = src.indexOf('lateSettlements:');
    const end = src.indexOf('data:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('listLateSettlements(input?.limit)');
    expect(fn).not.toMatch(/input\?\.limit \?\? 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });
});
