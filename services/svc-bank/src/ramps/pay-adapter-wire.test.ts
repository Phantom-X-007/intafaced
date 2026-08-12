import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIAT_OFFRAMP_PAY_ADAPTER_ID, FIAT_PAY_ADAPTER_WIRE, FIAT_RAMP_SOCKET } from './pay-adapter-wire.js';
import { CRYPTO_LEDGER_PROGRAMME, NO_RAMP_PROGRAMME, refuseFiatRamp } from './rails.js';
import { BankError } from '../errors.js';

/**
 * D26-P1-B4 — fiat pay-adapter wire honesty.
 *
 * Pins that bank names the same offramp adapter id svc-pay registers, without
 * importing svc-pay (§2). Proves no second fiat book / APY / BIN invention.
 */

const here = dirname(fileURLToPath(import.meta.url));
const payBankPayoutSrc = readFileSync(join(here, '..', '..', '..', 'svc-pay', 'src', 'rails', 'bank-payout.ts'), 'utf8');

describe('fiat pay-adapter wire (D26-P1-B4)', () => {
  it('offramp id matches svc-pay BankPayoutAbsentAdapter.id by source pin', () => {
    expect(FIAT_OFFRAMP_PAY_ADAPTER_ID).toBe('bank-payout');
    expect(payBankPayoutSrc).toMatch(/readonly id = 'bank-payout'/);
    expect(payBankPayoutSrc).toMatch(/mode = 'absent'/);
  });

  it('wire is refuse-honest: null onramp, bank-payout offramp, socket name stable', () => {
    expect(FIAT_PAY_ADAPTER_WIRE).toEqual({ onramp: null, offramp: 'bank-payout' });
    expect(FIAT_RAMP_SOCKET).toBe('socket.psp-partners');
    expect(NO_RAMP_PROGRAMME.fiatPayAdapters).toBe(FIAT_PAY_ADAPTER_WIRE);
    expect(CRYPTO_LEDGER_PROGRAMME.fiatPayAdapters).toBe(FIAT_PAY_ADAPTER_WIRE);
  });

  it('refuseFiatRamp names pay adapter / second-book posture by direction', () => {
    expect(() => refuseFiatRamp('onramp')).toThrow(BankError);
    try {
      refuseFiatRamp('onramp');
    } catch (err) {
      expect(err).toMatchObject({ code: 'bank.fiat_ramp_socket' });
      expect(String((err as Error).message)).toMatch(/socket\.psp-partners/);
      expect(String((err as Error).message)).toMatch(/no registered svc-pay fiat-inbound/);
      expect(String((err as Error).message)).not.toMatch(/APY|BIN/i);
    }

    try {
      refuseFiatRamp('offramp');
    } catch (err) {
      expect(err).toMatchObject({ code: 'bank.fiat_ramp_socket' });
      expect(String((err as Error).message)).toMatch(/bank-payout/);
      expect(String((err as Error).message)).toMatch(/second fiat book/);
    }
  });

  it('never invents a bank-local fiat ledger rail', () => {
    expect(CRYPTO_LEDGER_PROGRAMME.cryptoRail).toBe('bank-crypto-ledger');
    expect(CRYPTO_LEDGER_PROGRAMME.cryptoRail).not.toBe(FIAT_OFFRAMP_PAY_ADAPTER_ID);
    expect(NO_RAMP_PROGRAMME.cryptoRail).toBeNull();
  });
});
