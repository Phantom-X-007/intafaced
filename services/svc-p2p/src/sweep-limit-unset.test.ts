import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { P2pError, assertSweepDeadlinesLimit, assertSweepSettlementsLimit } from './p2p-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

/**
 * sweepSettlements / sweepDeadlines batch size is refuse-closed when unset.
 *
 * Both used `limit = 100`, so omit invented a 100-row operator batch.
 * Blank must refuse. Owner may pass 100 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('sweep batch limit unset refuse', () => {
  it('assertSweepSettlementsLimit refuses blank / NaN / 0 — never invents 100', () => {
    expect(() => assertSweepSettlementsLimit(undefined)).toThrow(P2pError);
    expect(() => assertSweepSettlementsLimit(Number.NaN)).toThrow(P2pError);
    expect(() => assertSweepSettlementsLimit(0)).toThrow(P2pError);
    try {
      assertSweepSettlementsLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(P2pError);
      expect((e as P2pError).code).toBe('p2p.sweep_settlements_limit_unset');
      expect((e as P2pError).message).toBe(resolveP2pCopy(P2P_COPY.sweepSettlementsLimitUnset));
      expect((e as P2pError).message).not.toMatch(/100-row|default 100/i);
    }
  });

  it('assertSweepDeadlinesLimit refuses blank / NaN / 0 — never invents 100', () => {
    expect(() => assertSweepDeadlinesLimit(undefined)).toThrow(P2pError);
    expect(() => assertSweepDeadlinesLimit(Number.NaN)).toThrow(P2pError);
    expect(() => assertSweepDeadlinesLimit(0)).toThrow(P2pError);
    try {
      assertSweepDeadlinesLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(P2pError);
      expect((e as P2pError).code).toBe('p2p.sweep_deadlines_limit_unset');
      expect((e as P2pError).message).toBe(resolveP2pCopy(P2P_COPY.sweepDeadlinesLimitUnset));
      expect((e as P2pError).message).not.toMatch(/100-row|default 100/i);
    }
  });

  it('accepts owner-published 100 and caps at 200', () => {
    expect(assertSweepSettlementsLimit(100)).toBe(100);
    expect(assertSweepDeadlinesLimit(100)).toBe(100);
    expect(assertSweepSettlementsLimit(1)).toBe(1);
    expect(assertSweepDeadlinesLimit(1)).toBe(1);
    expect(assertSweepSettlementsLimit(200)).toBe(200);
    expect(assertSweepDeadlinesLimit(200)).toBe(200);
    expect(assertSweepSettlementsLimit(201)).toBe(200);
    expect(assertSweepDeadlinesLimit(201)).toBe(200);
  });

  it('sweepSettlements no longer defaults limit to 100', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/p2p-service.ts'), 'utf8');
    const start = src.indexOf('async sweepSettlements(');
    const end = src.indexOf('async listLateSettlements(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertSweepSettlementsLimit');
    expect(fn).not.toMatch(/limit = 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });

  it('sweepDeadlines no longer defaults limit to 100', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/p2p-service.ts'), 'utf8');
    const start = src.indexOf('async sweepDeadlines(');
    const end = src.indexOf('private async applyTimeout(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertSweepDeadlinesLimit');
    expect(fn).not.toMatch(/limit = 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });

  it('index sweep publishes 100 explicitly — does not omit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/index.ts'), 'utf8');
    expect(src).toContain('sweepSettlements(100)');
    expect(src).toContain('sweepDeadlines(undefined, 100)');
    expect(src).not.toMatch(/sweepSettlements\(\s*\)/);
    expect(src).not.toMatch(/sweepDeadlines\(\s*\)/);
  });
});
