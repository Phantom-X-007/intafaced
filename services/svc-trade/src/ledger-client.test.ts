import { afterEach, describe, expect, it, vi } from 'vitest';
import { InsufficientFundsError } from '@intafaced/ledger-client';
import { verifyServiceHeaders } from '@intafaced/contracts';
import { createLedgerClient } from './ledger-client.js';

/**
 * THE REGRESSION THIS FILE EXISTS FOR.
 *
 * `router.ts` answers BAD_REQUEST for `InsufficientFundsError`, with a comment
 * explaining that `ledger.insufficient_funds` must not look retryable. This
 * client threw a plain `Error`, which is not an instance of anything the router
 * knows — so on the running fleet a user who could not afford an order got
 * **500 INTERNAL_SERVER_ERROR**, the most retryable class there is.
 *
 * Every unit test agreed with the comment, because `trade-service.test.ts` uses
 * the in-process ledger and receives the typed error directly. Only a request
 * crossing a real process boundary could see the difference, and only
 * `tooling/e2e/src/failure-paths.e2e.test.ts` did.
 *
 * These tests reproduce the wire, so a fleet is never again the only thing that
 * can catch it.
 */

const SECRET = 'internal-service-secret-at-least-32-characters-long';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answer as svc-ledger's `httpError` does — status plus a body carrying `code`. */
function stubLedger(status: number, body: unknown): { calls: Array<Record<string, string>> } {
  const calls: Array<Record<string, string>> = [];

  vi.stubGlobal('fetch', async (_input: string, init?: RequestInit) => {
    calls.push(Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])));
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });

  return { calls };
}

const post = () =>
  createLedgerClient('http://svc-ledger:4001', SECRET).post({
    idempotencyKey: 'idem-1',
    module: 'trade',
    reason: 'trade.hold',
    entries: [],
  });

describe('svc-trade ledger client — error translation', () => {
  it('rebuilds InsufficientFundsError so the router can answer 400', async () => {
    stubLedger(400, { message: 'Insufficient USDT: requested 100, available 5', code: 'ledger.insufficient_funds' });

    // The instance check is the whole point — `toTrpcError` branches on it.
    await expect(post()).rejects.toBeInstanceOf(InsufficientFundsError);
    // And the ledger's own text survives, because "requested 100, available 5"
    // is the only part of this a user can act on.
    await expect(post()).rejects.toThrow(/requested 100, available 5/);
  });

  /**
   * Deliberately NOT translated. `toTrpcError` maps every `LedgerError` to
   * BAD_REQUEST, so translating this one would tell a user their request was
   * bad when an operator had stopped the book. It stays a 500 until the right
   * class per ledger code is decided in its own PR.
   */
  it('leaves other ledger codes as a generic error', async () => {
    stubLedger(412, { message: 'posting is frozen', code: 'ledger.frozen' });
    await expect(post()).rejects.not.toBeInstanceOf(InsufficientFundsError);
  });

  it('survives a non-JSON body without losing the detail', async () => {
    stubLedger(502, '<html>bad gateway</html>');
    await expect(post()).rejects.toThrow(/502.*bad gateway/s);
  });

  it('signs every call so svc-ledger accepts it', async () => {
    const { calls } = stubLedger(400, { message: 'nope', code: 'ledger.insufficient_funds' });
    await post().catch(() => undefined);
    expect(verifyServiceHeaders(calls[0] ?? {}, SECRET).service).toBe('svc-trade');
  });
});
