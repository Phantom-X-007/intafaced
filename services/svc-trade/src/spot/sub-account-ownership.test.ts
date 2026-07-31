import { describe, expect, it } from 'vitest';
import { TradeError } from './types.js';
import { assertSubAccountOwned, type SubAccountOwnershipSource } from './sub-account-ownership.js';
import type { SubAccountOwnership } from '@intafaced/contracts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SUB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function source(row: SubAccountOwnership | null, unavailable = false): SubAccountOwnershipSource {
  return {
    async get() {
      if (unavailable) throw new TradeError('down', 'trade.sub_account_unavailable');
      return row;
    },
  };
}

describe('assertSubAccountOwned', () => {
  it('allows an active book owned by the principal', async () => {
    await expect(assertSubAccountOwned(source({ id: SUB, parentUserId: OWNER, revoked: false }), OWNER, SUB)).resolves.toBeUndefined();
  });

  it('denies a missing id (same code as foreign — no existence leak)', async () => {
    await expect(assertSubAccountOwned(source(null), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_denied',
    });
  });

  it('denies a foreign parent with the same code as missing', async () => {
    await expect(assertSubAccountOwned(source({ id: SUB, parentUserId: OTHER, revoked: false }), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_denied',
    });
  });

  it('refuses a revoked book the principal owns', async () => {
    await expect(assertSubAccountOwned(source({ id: SUB, parentUserId: OWNER, revoked: true }), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_revoked',
    });
  });

  it('propagates identity unavailable (fail closed)', async () => {
    await expect(assertSubAccountOwned(source(null, true), OWNER, SUB)).rejects.toMatchObject({
      code: 'trade.sub_account_unavailable',
    });
  });
});
