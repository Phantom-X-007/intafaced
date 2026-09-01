import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { describe, expect, it } from 'vitest';
import { MemoryLedger, parseAmount as amt } from '@intafaced/ledger-client';
import { BankError } from './errors.js';
import { BANK_OFFRAMP_COOLING_HOURS_ENV, requireOfframpCoolingHours } from './offramp-cooling.js';
import { RampService } from './ramps/ramp-service.js';
import { CRYPTO_LEDGER_PROGRAMME } from './ramps/rails.js';

function unusedSql(): Sql {
  const trap = () => {
    throw new Error('sql must not run before cooling refuse');
  };
  return new Proxy(trap, { apply: trap, get: trap }) as unknown as Sql;
}

describe('requireOfframpCoolingHours — owner window, never invent 24h', () => {
  it('refuses unset, blank, non-integer, and negative by name', () => {
    for (const raw of [undefined, '', '  ', '24h', 'abc', '-1', '1.5', '1e2']) {
      try {
        requireOfframpCoolingHours(raw);
        throw new Error(`expected refuse for ${JSON.stringify(raw)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(BankError);
        expect(err).toMatchObject({ code: 'bank.offramp_cooling_unset' });
      }
    }
  });

  it('accepts a non-negative integer the owner actually set — including zero', () => {
    expect(requireOfframpCoolingHours('0')).toBe(0);
    expect(requireOfframpCoolingHours('1')).toBe(1);
    expect(requireOfframpCoolingHours(' 48 ')).toBe(48);
    expect(BANK_OFFRAMP_COOLING_HOURS_ENV).toBe('BANK_OFFRAMP_COOLING_HOURS');
  });

  it('does not substitute 24 when the owner is silent', () => {
    expect(() => requireOfframpCoolingHours(undefined)).toThrow(BankError);
    expect(() => requireOfframpCoolingHours(undefined)).not.toThrow(/24/);
  });
});

describe('RampService.offramp — cooling refuse is before dest, claim, and withdrawHold', () => {
  it('blank owner window refuses bank.offramp_cooling_unset with no ledger post', async () => {
    const ledger = new MemoryLedger();
    const ramps = new RampService(unusedSql(), ledger, {
      programme: CRYPTO_LEDGER_PROGRAMME,
      offrampCoolingHours: '',
    });
    await expect(
      ramps.offramp({
        offrampId: randomUUID(),
        userId: '11111111-1111-4111-8111-111111111111',
        assetId: 'USDT',
        amount: amt('10'),
        kind: 'crypto',
        destinationRef: '0x000000000000000000000000000000000000dEaD',
        clientRef: 'cool-no-sql',
      }),
    ).rejects.toMatchObject({ code: 'bank.offramp_cooling_unset' });
    expect(ledger.journal()).toHaveLength(0);
    expect(ledger.journal().some((tx) => tx.reason === 'withdraw.held')).toBe(false);
  });
});
