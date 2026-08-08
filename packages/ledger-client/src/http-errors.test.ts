import { describe, expect, it } from 'vitest';
import { InsufficientFundsError, LedgerError } from './types.js';
import { rehydrateLedgerHttpError } from './http-errors.js';

/**
 * WHAT SURVIVES THE WIRE.
 *
 * Five services reach svc-ledger over HTTP and branch on the error they get
 * back — `instanceof LedgerError`, `err.code`, and in three places they write
 * `err.code` into a database column that an operator later reads to find out why
 * a money movement was refused. Everything this function drops, those branches
 * take the wrong side of.
 *
 * The cases below are the codes `s2s-http.httpError` actually emits. If it learns
 * a new one, the table here is where it has to be added.
 */
describe('rehydrateLedgerHttpError', () => {
  it('rebuilds InsufficientFundsError from structured body', () => {
    const err = rehydrateLedgerHttpError(
      '/trpc/post',
      400,
      JSON.stringify({
        message: 'Insufficient USDT: requested 10, available 0',
        code: 'ledger.insufficient_funds',
        accountId: 'acct-1',
        assetId: 'USDT',
        requested: '10',
        availableBalance: '0',
      }),
    );
    expect(err).toBeInstanceOf(InsufficientFundsError);
    expect((err as InsufficientFundsError).assetId).toBe('USDT');
  });

  /**
   * THE DEFECT, and the one that costs the most.
   *
   * A frozen ledger is a deliberate platform halt with a reason and an actor.
   * Over the wire it arrived as a bare `Error`, so
   * `err instanceof LedgerError ? err.code : 'bank.post_failed'` — svc-bank
   * card-service.ts:589, :734 and loans/loan-service.ts:1601 — durably recorded
   * `bank.post_failed` for it. The reason the money did not move was written down
   * wrong, permanently.
   */
  it('keeps ledger.frozen a LedgerError, so a halt is not filed as an unknown failure', () => {
    const err = rehydrateLedgerHttpError(
      '/trpc/post',
      412,
      JSON.stringify({ message: 'Ledger posting is frozen: reconciliation mismatch', code: 'ledger.frozen' }),
    );

    expect(err).toBeInstanceOf(LedgerError);
    expect((err as LedgerError).code).toBe('ledger.frozen');
    // The caller logging `err.message` should see what the ledger said.
    expect(err.message).toBe('Ledger posting is frozen: reconciliation mismatch');
  });

  it.each([
    ['ledger.owner_identity_space', 400],
    ['ledger.unauthenticated', 401],
    ['ledger.invalid_entry', 400],
    ['ledger.unbalanced', 500],
    ['ledger.uninitialised', 500],
  ])('carries %s across the wire as a code', (code, status) => {
    const err = rehydrateLedgerHttpError('/trpc/post', status, JSON.stringify({ message: 'refused', code }));
    expect(err).toBeInstanceOf(LedgerError);
    expect((err as LedgerError).code).toBe(code);
  });

  /**
   * Not a subclass, and deliberately not.
   *
   * `UnbalancedTransactionError` carries `perAsset` and `OwnerIdentitySpaceError`
   * carries the owner type and id. Neither is on the wire. Rebuilding them with
   * empty or guessed fields would hand a caller a typed error whose data is
   * fabricated, which is worse than an honest base class because it reads as
   * trustworthy. The base class is enough: every caller branches on
   * `instanceof LedgerError` or on `.code`.
   */
  it('does not fabricate subclass fields it was never sent', () => {
    const err = rehydrateLedgerHttpError('/trpc/post', 500, JSON.stringify({ message: 'off by 1', code: 'ledger.unbalanced' }));
    expect(err).toBeInstanceOf(LedgerError);
    expect(err).not.toHaveProperty('perAsset');
  });

  /**
   * Still a plain Error, and this one is correct: no structured body means no
   * code was sent — a proxy error page, a truncated response, a handler that
   * threw before `httpError` ran. Inventing a code here would be worse than
   * saying nothing.
   */
  it('leaves a response with no code at all as a plain Error', () => {
    const err = rehydrateLedgerHttpError('/trpc/post', 500, '{"message":"boom"}');
    expect(err).not.toBeInstanceOf(LedgerError);
    expect(err.message).toMatch(/svc-ledger/);
  });

  it('leaves an unparseable body as a plain Error', () => {
    const err = rehydrateLedgerHttpError('/trpc/post', 502, '<html>Bad Gateway</html>');
    expect(err).not.toBeInstanceOf(LedgerError);
    expect(err.message).toMatch(/502/);
  });

  /**
   * The pre-`code` fallback still works. Older svc-ledger builds sent only a
   * message, and the regex path is what kept `InsufficientFundsError` alive
   * across that boundary — a rolling deploy has both versions live at once.
   */
  it('still recognises insufficient funds from the message alone', () => {
    const err = rehydrateLedgerHttpError('/trpc/post', 400, JSON.stringify({ message: 'Insufficient BTC: requested 2, available 1' }));
    expect(err).toBeInstanceOf(InsufficientFundsError);
    expect((err as InsufficientFundsError).assetId).toBe('BTC');
    expect((err as InsufficientFundsError).requested).toBe('2');
  });
});
