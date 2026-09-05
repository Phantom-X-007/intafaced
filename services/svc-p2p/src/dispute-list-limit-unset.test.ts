import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { P2pError, assertDisputeListLimit } from './p2p-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

/**
 * disputes.list page size is refuse-closed when unset.
 *
 * listDisputes used `input.limit ?? 50`, so omit invented a 50-row moderator queue.
 * Blank must refuse. Owner/client may pass 50 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('disputes.list limit unset refuse', () => {
  it('assertDisputeListLimit refuses blank / NaN / 0 — never invents 50', () => {
    expect(() => assertDisputeListLimit(undefined)).toThrow(P2pError);
    expect(() => assertDisputeListLimit(Number.NaN)).toThrow(P2pError);
    expect(() => assertDisputeListLimit(0)).toThrow(P2pError);
    try {
      assertDisputeListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(P2pError);
      expect((e as P2pError).code).toBe('p2p.dispute_list_limit_unset');
      expect((e as P2pError).message).toBe(resolveP2pCopy(P2P_COPY.disputeListLimitUnset));
      expect((e as P2pError).message).not.toMatch(/50-row|default 50/i);
    }
  });

  it('accepts owner-published 50 and caps at 200', () => {
    expect(assertDisputeListLimit(50)).toBe(50);
    expect(assertDisputeListLimit(1)).toBe(1);
    expect(assertDisputeListLimit(200)).toBe(200);
    expect(assertDisputeListLimit(201)).toBe(200);
  });

  it('listDisputes no longer defaults limit to 50', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/p2p-service.ts'), 'utf8');
    const start = src.indexOf('async listDisputes(');
    const end = src.indexOf('async getDisputeAsModerator(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertDisputeListLimit');
    expect(fn).not.toMatch(/input\.limit \?\? 50/);
    expect(fn).not.toMatch(/\?\? 50/);
  });
});
