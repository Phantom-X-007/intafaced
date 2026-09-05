import { describe, expect, it } from 'vitest';
import { TOKEN_LEDGER_UNPROBED, TOKEN_LEDGER_UNWIRED, tokenLedgerReadyHonesty, tokenReadyHonesty } from './ready-honesty.js';

describe('tokenReadyHonesty', () => {
  it('blank ledger is absent, not live', () => {
    expect(tokenLedgerReadyHonesty('')).toEqual({ status: 'absent', code: TOKEN_LEDGER_UNWIRED });
    expect(tokenLedgerReadyHonesty('   ')).toEqual({ status: 'absent', code: TOKEN_LEDGER_UNWIRED });
    expect(tokenLedgerReadyHonesty(undefined)).toEqual({ status: 'absent', code: TOKEN_LEDGER_UNWIRED });
  });

  it('nonempty ledger URL is configured unprobed — /ready does not ping', () => {
    expect(tokenLedgerReadyHonesty('http://localhost:4001')).toEqual({
      status: 'configured',
      code: TOKEN_LEDGER_UNPROBED,
    });
  });

  it('process ready stays true; job flags are env pins', () => {
    const body = tokenReadyHonesty({
      ledgerUrl: 'http://localhost:4001',
      emissionsEnabled: true,
      emissionsAutoTick: false,
      yieldJobEnabled: false,
      buybackJobEnabled: false,
    });
    expect(body.ready).toBe(true);
    expect(body.ledger).toEqual({ status: 'configured', code: TOKEN_LEDGER_UNPROBED });
    expect(body.yieldJobEnabled).toBe(false);
    expect(body.buybackJobEnabled).toBe(false);
  });
});
