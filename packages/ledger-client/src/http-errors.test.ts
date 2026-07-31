import { describe, expect, it } from 'vitest';
import { InsufficientFundsError } from './types.js';
import { rehydrateLedgerHttpError } from './http-errors.js';

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

  it('leaves other failures as plain Error', () => {
    const err = rehydrateLedgerHttpError('/trpc/post', 500, '{"message":"boom"}');
    expect(err).not.toBeInstanceOf(InsufficientFundsError);
    expect(err.message).toMatch(/svc-ledger/);
  });
});
