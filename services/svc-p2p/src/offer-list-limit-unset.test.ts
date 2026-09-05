import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { P2pError, assertOfferListLimit } from './p2p-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

/**
 * offers.list page size is refuse-closed when unset.
 *
 * listOffers used `filter.limit ?? 50`, so omit invented a 50-row public board.
 * Blank must refuse. Owner/client may pass 50 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('offers.list limit unset refuse', () => {
  it('assertOfferListLimit refuses blank / NaN / 0 — never invents 50', () => {
    expect(() => assertOfferListLimit(undefined)).toThrow(P2pError);
    expect(() => assertOfferListLimit(Number.NaN)).toThrow(P2pError);
    expect(() => assertOfferListLimit(0)).toThrow(P2pError);
    try {
      assertOfferListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(P2pError);
      expect((e as P2pError).code).toBe('p2p.offer_list_limit_unset');
      expect((e as P2pError).message).toBe(resolveP2pCopy(P2P_COPY.offerListLimitUnset));
      expect((e as P2pError).message).not.toMatch(/50-row|default 50/i);
    }
  });

  it('accepts owner-published 50 and caps at 200', () => {
    expect(assertOfferListLimit(50)).toBe(50);
    expect(assertOfferListLimit(1)).toBe(1);
    expect(assertOfferListLimit(200)).toBe(200);
    expect(assertOfferListLimit(201)).toBe(200);
  });

  it('listOffers no longer defaults limit to 50', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/p2p-service.ts'), 'utf8');
    const start = src.indexOf('async listOffers(');
    const end = src.indexOf('async getOffer(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertOfferListLimit');
    expect(fn).not.toMatch(/filter\.limit \?\? 50/);
    expect(fn).not.toMatch(/\?\? 50/);
  });
});
