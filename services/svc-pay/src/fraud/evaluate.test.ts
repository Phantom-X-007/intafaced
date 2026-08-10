import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateFraud, isAutoDecline, type FraudDecision } from './evaluate.js';

/**
 * Unit card — pay.fraud mechanism · wave 13 L02
 *
 * 1. Promise: SPEC-PAY-VERTICALS §3 — velocity, amount anomaly, blocklists,
 *    explainable decisions, kill-switch; never silent decline.
 * 2. Reachable break on tip: no fraud evaluate module; only unwired chargeback pins.
 * 3. Done bar: mechanism scores with reasons; chargeback money still unwired (Class X park).
 * 4. Class P (policy/mechanism, no ledger post).
 * 5. Paths: services/svc-pay/src/fraud/** only — no payment-service dual-write.
 * 6. RED first.
 * 7. Collision: clear of Denon #1625–1627.
 */

const here = dirname(fileURLToPath(import.meta.url));
const base = {
  merchantId: 'm_1',
  amount: '100',
  assetId: 'USDT',
};

describe('pay.fraud mechanism — evaluateFraud', () => {
  it('allows a clean payment with no signals', () => {
    const d = evaluateFraud(base);
    expect(d.outcome).toBe('allow');
    expect(d.reasons).toEqual([]);
  });

  it('declines blocklisted IP with an explicit reason (never silent)', () => {
    const d = evaluateFraud({
      ...base,
      ip: '203.0.113.9',
      blocklists: { ips: ['203.0.113.9'] },
    });
    expect(d.outcome).toBe('decline');
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.reasons[0]?.ruleId).toBe('blocklist_ip');
    expect(isAutoDecline(d)).toBe(true);
  });

  it('declines blocklisted device with reason', () => {
    const d = evaluateFraud({
      ...base,
      deviceId: 'dev_bad',
      blocklists: { devices: new Set(['dev_bad']) },
    });
    expect(d.outcome).toBe('decline');
    expect(d.reasons.some((r) => r.ruleId === 'blocklist_device')).toBe(true);
  });

  it('reviews velocity count breach (default action) without inventing a count', () => {
    const noMeter = evaluateFraud({
      ...base,
      thresholds: { maxPaymentsInWindow: 3 },
      // recentPaymentCount omitted — must not invent
    });
    expect(noMeter.outcome).toBe('allow');

    const d = evaluateFraud({
      ...base,
      recentPaymentCount: 10,
      thresholds: { maxPaymentsInWindow: 3 },
    });
    expect(d.outcome).toBe('review');
    expect(d.reasons[0]?.ruleId).toBe('velocity_count');
  });

  it('reviews velocity volume when meter exceeds max (decimal strings)', () => {
    const d = evaluateFraud({
      ...base,
      recentVolume: '5000',
      thresholds: { maxVolumeInWindow: '1000' },
    });
    expect(d.outcome).toBe('review');
    expect(d.reasons[0]?.ruleId).toBe('velocity_volume');
  });

  it('amount anomaly needs a baseline — never invents one', () => {
    const noBaseline = evaluateFraud({
      ...base,
      amount: '99999',
      thresholds: { amountAnomalyMultiplier: 5 },
    });
    expect(noBaseline.outcome).toBe('allow');

    const d = evaluateFraud({
      ...base,
      amount: '600',
      baselineAmount: '100',
      thresholds: { amountAnomalyMultiplier: 5 },
    });
    expect(d.outcome).toBe('review');
    expect(d.reasons[0]?.ruleId).toBe('amount_anomaly');
  });

  it('kill-switch disables a rule even when signals would fire', () => {
    const d = evaluateFraud({
      ...base,
      ip: '203.0.113.9',
      blocklists: { ips: ['203.0.113.9'] },
      enabled: { blocklist_ip: false },
    });
    expect(d.outcome).toBe('allow');
    expect(d.skippedDisabled).toContain('blocklist_ip');
    expect(d.reasons).toEqual([]);
  });

  it('picks the worse outcome when multiple rules fire', () => {
    const d = evaluateFraud({
      ...base,
      ip: '203.0.113.9',
      recentPaymentCount: 99,
      blocklists: { ips: ['203.0.113.9'] },
      thresholds: { maxPaymentsInWindow: 1, velocityCountAction: 'review' },
    });
    expect(d.outcome).toBe('decline');
    expect(d.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('never returns decline/review with empty reasons (invariant)', () => {
    const samples: FraudDecision[] = [
      evaluateFraud(base),
      evaluateFraud({ ...base, ip: '1.1.1.1', blocklists: { ips: ['9.9.9.9'] } }),
      evaluateFraud({
        ...base,
        recentPaymentCount: 5,
        thresholds: { maxPaymentsInWindow: 1, velocityCountAction: 'decline' },
      }),
    ];
    for (const d of samples) {
      if (d.outcome !== 'allow') {
        expect(d.reasons.length).toBeGreaterThan(0);
      }
    }
  });

  it('chargeback ledger recipes stay unwired from fraud module (Class X park)', () => {
    const src = readFileSync(join(here, 'evaluate.ts'), 'utf8');
    expect(src).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
    expect(src).not.toMatch(/ledger-client|postTransaction|PostRequest/);
    // payment-service still must not call chargebacks (existing honesty pin).
    const pay = readFileSync(join(here, '../payment-service.ts'), 'utf8');
    expect(pay).not.toMatch(/chargebackOpen|chargebackWon|chargebackShortfall/);
  });

  it('does not score protected-characteristic fields', () => {
    const src = readFileSync(join(here, 'evaluate.ts'), 'utf8');
    expect(src).not.toMatch(/\b(race|religion|gender|ethnicity|nationality)\b/i);
  });
});
