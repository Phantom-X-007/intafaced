import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertFraudScoreSourceNotBlank,
  assertNoInventedFraudScores,
  evaluateFraud,
  FORBIDDEN_FRAUD_SCORE_FIELDS,
  FraudScoreError,
} from './evaluate.js';

/**
 * Unit card — pay.fraud blank score pin
 *
 * 1. Promise: refuse invented approval/decline rates and chargeback magnitudes;
 *    fail-closed when scoreSource is present but blank. No model invented.
 * 2. Reachable break: a blank source or invented rate could silently allow.
 * 3. Done bar: blank source → pay.fraud_score_source_blank; invented fields throw.
 * 4. Class P (mechanism pin, no ledger post). Tracker stays not-done.
 * 5. Paths: services/svc-pay/src/fraud/** only.
 */

const here = dirname(fileURLToPath(import.meta.url));
const base = {
  merchantId: 'm_1',
  amount: '100',
  assetId: 'USDT',
};

describe('pay.fraud — refuse blank score source and invented rates', () => {
  it('rule-only path (scoreSource omitted) does not invent a score', () => {
    const d = evaluateFraud(base);
    expect(d.outcome).toBe('allow');
    expect(d).not.toHaveProperty('approvalRate');
    expect(d).not.toHaveProperty('declineRate');
    expect(d).not.toHaveProperty('chargebackMagnitude');
  });

  it('refuses a blank score source instead of inventing a score', () => {
    for (const scoreSource of ['', '   ', null] as const) {
      try {
        evaluateFraud({ ...base, scoreSource });
        expect.unreachable('blank scoreSource must refuse');
      } catch (e) {
        expect(e).toBeInstanceOf(FraudScoreError);
        const err = e as FraudScoreError;
        expect(err.code).toBe('pay.fraud_score_source_blank');
        expect(err.field).toBe('scoreSource');
      }
    }
  });

  it('accepts a named external source without synthesising rates', () => {
    const d = evaluateFraud({ ...base, scoreSource: 'psp-adapter:fixture' });
    expect(d.outcome).toBe('allow');
    expect(d).not.toHaveProperty('approvalRate');
    expect(d).not.toHaveProperty('chargebackMagnitude');
  });

  it('throws when inventable approval/decline/chargeback fields are supplied', () => {
    expect(() => assertNoInventedFraudScores({ ...base, approvalRate: 0.97 })).toThrow(FraudScoreError);
    expect(() => assertNoInventedFraudScores({ ...base, declineRate: 0.03 })).toThrow(/declineRate/);
    expect(() => assertNoInventedFraudScores({ ...base, chargebackMagnitude: '400' })).toThrow(/chargebackMagnitude/);
    expect(() => assertNoInventedFraudScores({ ...base, chargebackRate: 0.01 })).toThrow(/chargebackRate/);
    expect(() => evaluateFraud({ ...base, approvalRate: 0.99 } as typeof base)).toThrow(/approvalRate/);
  });

  it('assertFraudScoreSourceNotBlank ignores omitted source and refuses blank', () => {
    expect(() => assertFraudScoreSourceNotBlank(base)).not.toThrow();
    expect(() => assertFraudScoreSourceNotBlank({ ...base, scoreSource: 'rail-ops' })).not.toThrow();
    expect(() => assertFraudScoreSourceNotBlank({ ...base, scoreSource: '  ' })).toThrow(FraudScoreError);
  });

  it('fraud module source does not assign inventable score fields', () => {
    const files = ['evaluate.ts', 'index.ts'];
    for (const f of files) {
      const src = readFileSync(join(here, f), 'utf8');
      expect(src, f).not.toMatch(/\bapprovalRate\s*:/);
      expect(src, f).not.toMatch(/\bdeclineRate\s*:/);
      expect(src, f).not.toMatch(/\bchargebackMagnitude\s*:/);
      expect(src, f).not.toMatch(/\bchargebackRate\s*:/);
    }
    expect(FORBIDDEN_FRAUD_SCORE_FIELDS).toContain('approvalRate');
    expect(FORBIDDEN_FRAUD_SCORE_FIELDS).toContain('declineRate');
    expect(FORBIDDEN_FRAUD_SCORE_FIELDS).toContain('chargebackMagnitude');
  });
});
