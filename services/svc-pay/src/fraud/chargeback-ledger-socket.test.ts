import { describe, expect, it } from 'vitest';
import {
  CHARGEBACK_LEDGER_REFUSE_CODE,
  CHARGEBACK_LEDGER_SOCKET_ID,
  refuseChargebackLedgerPost,
} from './chargeback-ledger-socket.js';

describe('chargeback ledger §13 socket (D26-P1-P5)', () => {
  it('refuses every post with a named socket id and code', () => {
    const r = refuseChargebackLedgerPost({ disputeId: 'dp_1', paymentId: 'pay_1' });
    expect(r.code).toBe(CHARGEBACK_LEDGER_REFUSE_CODE);
    expect(r.socket).toBe(CHARGEBACK_LEDGER_SOCKET_ID);
    expect(r.disputeId).toBe('dp_1');
    expect(r.paymentId).toBe('pay_1');
    expect(r.message).toMatch(/not wired/i);
    expect(r.message).toMatch(/no value moved/i);
  });

  it('never invents a success path', () => {
    const a = refuseChargebackLedgerPost({ disputeId: 'a', paymentId: 'b' });
    const b = refuseChargebackLedgerPost({ disputeId: 'a', paymentId: 'b' });
    expect(a.code).toBe(b.code);
    expect(a.socket).toBe(CHARGEBACK_LEDGER_SOCKET_ID);
  });
});
