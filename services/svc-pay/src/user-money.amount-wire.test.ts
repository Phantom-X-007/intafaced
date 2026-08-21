import { describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { MemoryLedger, parseAmount, userAvailable, formatAmount } from '@intafaced/ledger-client';
import { requireUserMoneyAmount, UserMoneyService } from './user-money-service.js';
import { RailRegistry } from './rails/registry.js';
import { CardSandboxAdapter } from './rails/card-sandbox.js';

/**
 * Fail-first: a JSON number on amount is a typed money error; a decimal string
 * is parseAmount. Does not need Postgres — refuse happens before claim.
 * Number(row.attempts) is not money.
 */
const SECRET = 'svc-pay-user-money-amount-wire-test-secret-32ch';
const USER = '11111111-1111-4111-8111-111111111111';
const OPERATOR = '99999999-9999-4999-8999-999999999999';

function service(): { money: UserMoneyService; ledger: MemoryLedger } {
  const sql = (() => Promise.resolve([])) as unknown as Sql;
  const ledger = new MemoryLedger();
  const rails = new RailRegistry([new CardSandboxAdapter({ secret: SECRET })]);
  return { ledger, money: new UserMoneyService(sql, ledger, rails, { operatorCreditRails: ['card-sandbox'] }) };
}

describe('user-money amount wire — JSON number refused, decimal string via parseAmount', () => {
  it('requireUserMoneyAmount rejects a JSON/JS number with a typed money error', () => {
    const wire = JSON.parse('{"amount":100.5}') as { amount: unknown };
    let err: unknown;
    try {
      requireUserMoneyAmount(wire.amount);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ name: 'PayError', code: 'pay.invalid_amount' });
  });

  it('requireUserMoneyAmount accepts a decimal string via parseAmount', () => {
    const wire = JSON.parse('{"amount":"100.000000000000000001"}') as { amount: string };
    expect(requireUserMoneyAmount(wire.amount)).toBe(parseAmount('100.000000000000000001'));
  });

  it('requireUserMoneyAmount still accepts a scaled bigint the router already parsed', () => {
    expect(requireUserMoneyAmount(parseAmount('40'))).toBe(parseAmount('40'));
  });

  it('credit rejects a JSON/JS number for amount and does not post', async () => {
    const { money, ledger } = service();
    const wire = JSON.parse('{"amount":100.5}') as { amount: unknown };

    await expect(
      money.credit({
        userId: USER,
        assetId: 'USDT',
        amount: wire.amount as never,
        rail: 'card-sandbox',
        railRef: 'psp_json_number',
        creditedBy: OPERATOR,
      }),
    ).rejects.toMatchObject({ name: 'PayError', code: 'pay.invalid_amount' });

    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('0');
  });

  it('withdraw rejects a JSON/JS number for amount and does not post', async () => {
    const { money, ledger } = service();
    const wire = JSON.parse('{"amount":40}') as { amount: unknown };

    await expect(
      money.withdraw({
        userId: USER,
        assetId: 'USDT',
        amount: wire.amount as never,
        rail: 'card-sandbox',
        destination: { kind: 'bank', ref: 'DE89370400440532013000' },
        clientRef: 'w-json-number',
      }),
    ).rejects.toMatchObject({ name: 'PayError', code: 'pay.invalid_amount' });

    expect(formatAmount((await ledger.balance(userAvailable(USER, 'USDT'))).amount)).toBe('0');
  });

  it('credit routes a malformed decimal string through parseAmount as pay.invalid_amount', async () => {
    const { money } = service();
    const wire = JSON.parse('{"amount":"not-a-decimal"}') as { amount: string };

    await expect(
      money.credit({
        userId: USER,
        assetId: 'USDT',
        amount: wire.amount,
        rail: 'card-sandbox',
        railRef: 'psp_bad_string',
        creditedBy: OPERATOR,
      }),
    ).rejects.toMatchObject({ name: 'PayError', code: 'pay.invalid_amount' });
  });
});
