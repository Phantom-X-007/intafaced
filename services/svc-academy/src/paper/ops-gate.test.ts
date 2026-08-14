import { describe, expect, it } from 'vitest';
import { PAPER_OPS_ENV_KEY, PAPER_OPS_FLAG_ID, isPaperOpsEnabled, paperOpsDisabledMessage, paperOpsStatus } from './ops-gate.js';

describe('paper Stage-3 ops gate', () => {
  it('defaults enabled when flag is undefined', () => {
    expect(isPaperOpsEnabled(undefined)).toBe(true);
    expect(paperOpsStatus(undefined).enabled).toBe(true);
  });

  it('kills paper drills when ops sets false — live trade stays unaffected', () => {
    expect(isPaperOpsEnabled(false)).toBe(false);
    const status = paperOpsStatus(false);
    expect(status.enabled).toBe(false);
    expect(status.liveTradeUnaffected).toBe(true);
    expect(status.flagId).toBe(PAPER_OPS_FLAG_ID);
    expect(status.envKey).toBe(PAPER_OPS_ENV_KEY);
    expect(status.realMoney).toBe(false);
    expect(status.simulated).toBe(true);
    expect(status.venue).toBe('paper');
  });

  it('keeps paper on when enabled is true', () => {
    expect(isPaperOpsEnabled(true)).toBe(true);
    expect(paperOpsStatus(true).enabled).toBe(true);
  });

  it('names the refuse message without inventing prices or live risk', () => {
    expect(paperOpsDisabledMessage()).toMatch(/live trade unchanged/i);
    expect(paperOpsDisabledMessage()).not.toMatch(/price|pnl|balance|ledger/i);
  });
});
