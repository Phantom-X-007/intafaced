import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import { SIMULATED_SEAL, sealSimulated } from './simulated-result.js';
import {
  PAPER_REAL_MONEY_BANNED_KEYS,
  assertPaperInputNeverClaimsLive,
  assertPaperNeverReadableAsRealMoney,
  isPaperRealMoneyBannedKey,
} from './real-money-ban.js';

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

  it.each(['realMoney', 'realLedger', 'withdrawable', 'live', 'isLive'] as const)('REFUSES when %s is flipped to true', (key) => {
    const dirty = { ...sealSimulated({ ok: true }), [key]: true };
    expect(() => assertPaperNeverReadableAsRealMoney(dirty)).toThrow(AcademyError);
  });

  it('REFUSES a venue that is not paper', () => {
    const dirty = { ...sealSimulated({ ok: true }), venue: 'spot' };
    expect(() => assertPaperNeverReadableAsRealMoney(dirty)).toThrow(AcademyError);
  });

  it('REFUSES an inbound body that claims live money', () => {
    expect(() => assertPaperInputNeverClaimsLive({ slug: 'x', realMoney: true })).toThrow(AcademyError);
    expect(() => assertPaperInputNeverClaimsLive({ market: { paper: true, live: true } })).toThrow(AcademyError);
  });

  it('fails if a public academy paper door can present paper as live', () => {
    const routerPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'router.ts');
    const text = readFileSync(routerPath, 'utf8');
    const start = text.indexOf('paperDrill:');
    const end = text.indexOf('\n    rooms:');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const region = text.slice(start, end);
    expect(region).toContain('paperDrill:');
    expect(region).toContain('paperDrillResult:');
    expect(region).toContain('paperOpsStatus:');
    expect((region.match(/assertPaperNeverReadableAsRealMoney/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((region.match(/assertPaperInputNeverClaimsLive/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(region).toMatch(/realMoney:\s*z\.literal\(false\)/);
    expect(region).toContain('.strict()');
  });
});
