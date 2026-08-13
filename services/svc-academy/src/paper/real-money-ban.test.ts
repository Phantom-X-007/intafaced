import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import { SIMULATED_SEAL, sealSimulated } from './simulated-result.js';
import { PAPER_REAL_MONEY_BANNED_KEYS, assertPaperNeverReadableAsRealMoney, isPaperRealMoneyBannedKey } from './real-money-ban.js';

describe('D26-P1-C4 — paper flag never readable as real money', () => {
  it('lists the custody-looking keys a paper payload must never carry', () => {
    expect(PAPER_REAL_MONEY_BANNED_KEYS).toContain('availableBalance');
    expect(PAPER_REAL_MONEY_BANNED_KEYS).toContain('ledgerTxId');
    expect(PAPER_REAL_MONEY_BANNED_KEYS).toContain('holdAmount');
    expect(PAPER_REAL_MONEY_BANNED_KEYS).toContain('withdrawableBalance');
    // Simulated PnL field names are allowed under the seal — not banned.
    expect(isPaperRealMoneyBannedKey('realisedPnl')).toBe(false);
    expect(isPaperRealMoneyBannedKey('totalPnl')).toBe(false);
  });

  it('lets a properly sealed drill payload through', () => {
    const sealed = sealSimulated({
      marketId: 'm1',
      realisedPnl: '12.5',
      valuation: { ...SIMULATED_SEAL, realisedPnl: '12.5', totalPnl: '12.5' },
    });
    expect(() => assertPaperNeverReadableAsRealMoney(sealed)).not.toThrow();
  });

  it.each([...PAPER_REAL_MONEY_BANNED_KEYS])('REFUSES a sealed payload that also carries %s', (key) => {
    const dirty = { ...sealSimulated({ ok: true }), [key]: '1.00' };
    expect(() => assertPaperNeverReadableAsRealMoney(dirty)).toThrow(AcademyError);
    try {
      assertPaperNeverReadableAsRealMoney(dirty);
    } catch (err) {
      expect((err as AcademyError).code).toBe('academy.paper_looks_like_real_money');
      expect((err as AcademyError).message).toMatch(/never be readable as real money/i);
    }
  });

  it('REFUSES nested custody keys under result.valuation', () => {
    const dirty = sealSimulated({
      valuation: { ...SIMULATED_SEAL, availableBalance: '100' },
    });
    expect(() => assertPaperNeverReadableAsRealMoney(dirty)).toThrow(AcademyError);
  });

  it.each(['realMoney', 'realLedger', 'withdrawable'] as const)('REFUSES when %s is flipped to true', (key) => {
    const dirty = { ...sealSimulated({ ok: true }), [key]: true };
    expect(() => assertPaperNeverReadableAsRealMoney(dirty)).toThrow(AcademyError);
  });
});
