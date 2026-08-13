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
 * 2. Reachable break on tip: configured rules silently allow when their signal is
 *    absent/malformed, and blocklist reasons disclose the matched IP/device value.
 * 3. Done bar: missing configured signals review with reasons; explanations do not
 *    disclose signal values; chargeback money stays unwired (Class X park).
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
  it('allows a clean payment when no signal-dependent rule is configured', () => {
    const d = evaluateFraud(base);
    expect(d.outcome).toBe('allow');
    expect(d.reasons).toEqual([]);
  });

  it('declines blocklisted IP with an explicit reason that does not disclose the IP', () => {
    const d = evaluateFraud({
      ...base,
      ip: '203.0.113.9',
      blocklists: { ips: ['203.0.113.9'] },
    });
    expect(d.outcome).toBe('decline');
    expect(d.reasons.length).toBeGreaterThan(0);
    expect(d.reasons[0]?.ruleId).toBe('blocklist_ip');
    expect(d.reasons[0]?.detail).not.toContain('203.0.113.9');
    expect(isAutoDecline(d)).toBe(true);
  });

  it('declines blocklisted device without disclosing the device identifier', () => {
    const d = evaluateFraud({
      ...base,
      deviceId: 'dev_bad',
      blocklists: { devices: new Set(['dev_bad']) },
    });
    expect(d.outcome).toBe('decline');
    expect(d.reasons.some((r) => r.ruleId === 'blocklist_device')).toBe(true);
    expect(d.reasons[0]?.detail).not.toContain('dev_bad');
  });

  it('reviews instead of silently allowing when a configured count signal is missing', () => {
    const noMeter = evaluateFraud({
      ...base,
      thresholds: { maxPaymentsInWindow: 3 },
      // recentPaymentCount omitted — must not invent
    });
    expect(noMeter.outcome).toBe('review');
    expect(noMeter.reasons).toEqual([{ ruleId: 'velocity_count', detail: 'recent payment count signal is unavailable' }]);

    const d = evaluateFraud({
      ...base,
      recentPaymentCount: 10,
      thresholds: { maxPaymentsInWindow: 3 },
    });
    expect(d.outcome).toBe('review');
    expect(d.reasons[0]?.ruleId).toBe('velocity_count');
  });

  it('reviews malformed configured velocity signals instead of silently allowing', () => {
    const badCount = evaluateFraud({
      ...base,
      recentPaymentCount: -1,
      thresholds: { maxPaymentsInWindow: 3 },
    });
    expect(badCount.outcome).toBe('review');
    expect(badCount.reasons[0]?.detail).toBe('recent payment count signal is unavailable');

    const badVolume = evaluateFraud({
      ...base,
      recentVolume: 'not-money',
      thresholds: { maxVolumeInWindow: '1000' },
    });
    expect(badVolume.outcome).toBe('review');
    expect(badVolume.reasons[0]?.detail).toBe('recent volume signal is unavailable');
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

  it('reviews when a configured amount anomaly rule has no baseline', () => {
    const noBaseline = evaluateFraud({
      ...base,
      amount: '99999',
      thresholds: { amountAnomalyMultiplier: 5 },
    });
    expect(noBaseline.outcome).toBe('review');
    expect(noBaseline.reasons[0]?.detail).toBe('merchant amount baseline signal is unavailable');

    const d = evaluateFraud({
      ...base,
      amount: '600',
      baselineAmount: '100',
      thresholds: { amountAnomalyMultiplier: 5 },
    });
    expect(d.outcome).toBe('review');
    expect(d.reasons[0]?.ruleId).toBe('amount_anomaly');
  });

  it('reviews when configured blocklist evaluation is missing its signal', () => {
    const missingIp = evaluateFraud({
      ...base,
      blocklists: { ips: ['203.0.113.9'] },
    });
    expect(missingIp.outcome).toBe('review');
    expect(missingIp.reasons).toEqual([{ ruleId: 'blocklist_ip', detail: 'IP risk signal is unavailable' }]);

    const missingDevice = evaluateFraud({
      ...base,
      blocklists: { devices: ['dev_bad'] },
    });
    expect(missingDevice.outcome).toBe('review');
    expect(missingDevice.reasons).toEqual([{ ruleId: 'blocklist_device', detail: 'device risk signal is unavailable' }]);
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
