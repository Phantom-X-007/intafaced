import { afterEach, describe, expect, it, vi } from 'vitest';
import { userAvailable } from '@intafaced/ledger-client';
import { createLedgerHistory } from '../ledger-client.js';

/**
 * §13 socket honesty for `ledger.history`.
 *
 * Production spend analytics must never invent "you spent nothing" when the
 * history procedure is missing or the ledger is down. That lie is worse than
 * an error — the user cannot tell a real zero from an unreadable book.
 *
 * This suite is pure HTTP-mock: no Postgres, no MemoryLedger. It proves the
 * fail-loud path of the production adapter only.
 */
describe('createLedgerHistory — §13 socket honesty', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws on non-OK and never returns an empty spend list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'procedure not found', code: 'NOT_FOUND' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const history = createLedgerHistory('http://ledger.test', 'a-test-internal-secret-long-enough');
    await expect(
      history.entriesFor(userAvailable('11111111-1111-4111-8111-111111111111', 'USDT'), {
        from: new Date('2026-01-01T00:00:00Z'),
        to: new Date('2026-02-01T00:00:00Z'),
      }),
    ).rejects.toBeTruthy();

    // The adapter must have asked the ledger — not short-circuited to [].
    expect(fetch).toHaveBeenCalled();
  });

  it('throws on 500 with no silent empty fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('ledger.history unavailable', {
            status: 500,
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    );

    const history = createLedgerHistory('http://ledger.test', 'a-test-internal-secret-long-enough');
    await expect(
      history.entriesFor(userAvailable('11111111-1111-4111-8111-111111111111', 'USDT'), {
        from: new Date('2026-01-01T00:00:00Z'),
        to: new Date('2026-02-01T00:00:00Z'),
      }),
    ).rejects.toBeTruthy();
  });
});
