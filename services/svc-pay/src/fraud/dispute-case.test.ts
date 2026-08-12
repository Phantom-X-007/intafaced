import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHARGEBACK_LEDGER_SOCKET_ID,
  DisputeCaseError,
  MemoryDisputeCaseStore,
} from './dispute-case.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('D26-P1-P5 chargeback dispute case mechanism', () => {
  it('opens a case keyed by disputeId (not payment id) and refuse-closes ledger via named socket', () => {
    const store = new MemoryDisputeCaseStore();
    const a = store.open({
      disputeId: 'dsp-1',
      paymentId: 'pay-1',
      merchantId: 'mer-1',
      amount: '40.5',
      assetId: 'USDT',
      reasonCode: '4855',
      paymentMarkedDisputed: true,
    });
    expect(a.status).toBe('open');
    expect(a.ledgerWire).toBe('refused');
    expect(a.ledgerRefuse.socket).toBe(CHARGEBACK_LEDGER_SOCKET_ID);
    expect(a.ledgerRefuse.code).toBe('pay.chargeback_ledger_unwired');
    expect(a.paymentMarkedDisputed).toBe(true);
    // Second presentment is a different disputeId.
    const b = store.open({
      disputeId: 'dsp-2',
      paymentId: 'pay-1',
      merchantId: 'mer-1',
      amount: '10',
      assetId: 'USDT',
    });
    expect(store.listForPayment('pay-1')).toHaveLength(2);
    expect(b.disputeId).toBe('dsp-2');
  });

  it('supports contest → won without inventing a money post', () => {
    const store = new MemoryDisputeCaseStore();
    store.open({
      disputeId: 'dsp-w',
      paymentId: 'pay-1',
      merchantId: 'mer-1',
      amount: '12',
      assetId: 'USDT',
    });
    expect(store.contest('dsp-w').status).toBe('contested');
    const won = store.markWon('dsp-w');
    expect(won.status).toBe('won');
    expect(won.closedAt).toBeTruthy();
    expect(won.ledgerWire).toBe('refused');
    expect(won.ledgerRefuse.socket).toBe(CHARGEBACK_LEDGER_SOCKET_ID);
  });

  it('refuses invalid transitions and blank dispute ids', () => {
    const store = new MemoryDisputeCaseStore();
    expect(() =>
      store.open({
        disputeId: '  ',
        paymentId: 'p',
        merchantId: 'm',
        amount: '1',
        assetId: 'USDT',
      }),
    ).toThrowError(DisputeCaseError);
    store.open({
      disputeId: 'dsp-x',
      paymentId: 'p',
      merchantId: 'm',
      amount: '1',
      assetId: 'USDT',
    });
    store.accept('dsp-x');
    expect(() => store.contest('dsp-x')).toThrowError(/already accepted/);
  });

  it('module never imports chargeback ledger recipes (Class M park)', () => {
    const src = readFileSync(join(here, 'dispute-case.ts'), 'utf8');
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall|recipes\.chargeback/);
  });
});
