/**
 * D26-P1-A6 — Agent metering product law seal (DB-free).
 *
 * Promise: metering-off = audit-only forever; no silent feeCharge.
 * Break: a future change could call UsageMeter.settle / recipes.feeCharge while
 *   meteringEnabled is false, or reintroduce usage_records dual-write "for later".
 * Done bar:
 *   · METERING_OFF_PRODUCT_LAW forbids usage records, feeCharge, request_id_replay
 *   · feeCharge exists only inside UsageMeter.settle (meter.ts)
 *   · settleWindow returns meteringOffSettlementStub before meter.settle when off
 *   · settleSession only calls settleWindow (inherits the gate)
 *   · think path meters only via shouldMeterUsage
 *   · runtime suite pins behavioural no-bill proofs
 * Class: N (honesty seal) — Class M money path remains UsageMeter.settle when on.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { METERING_OFF_PRODUCT_LAW, meteringOffSettlementStub, shouldMeterUsage } from './product-law.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(HERE, '..');

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('D26-P1-A6 metering-off product law seal', () => {
  it('law constants forbid bill paths forever', () => {
    expect(METERING_OFF_PRODUCT_LAW.id).toBe('D26-P1-A6');
    expect(METERING_OFF_PRODUCT_LAW.mode).toBe('audit_only');
    expect(METERING_OFF_PRODUCT_LAW.allowsUsageRecords).toBe(false);
    expect(METERING_OFF_PRODUCT_LAW.allowsFeeCharge).toBe(false);
    expect(METERING_OFF_PRODUCT_LAW.allowsRequestIdReplayRefuse).toBe(false);
  });

  it('meteringOffSettlementStub never marks settled and never invents a charge', () => {
    const stub = meteringOffSettlementStub('sess', '2026-08-12T00');
    expect(stub.settled).toBe(false);
    expect(stub.amount).toBe(0n);
    expect(stub.chargeTxId).toBeNull();
    expect(stub.chargeKey).toBe('agent.usage:sess:2026-08-12T00');
  });

  it('shouldMeterUsage requires both session.metered and process kill-switch', () => {
    expect(shouldMeterUsage(true, true)).toBe(true);
    expect(shouldMeterUsage(true, false)).toBe(false);
    expect(shouldMeterUsage(false, true)).toBe(false);
    expect(shouldMeterUsage(false, false)).toBe(false);
  });

  it('recipes.feeCharge appears only in meter.ts settle path (no silent second door)', () => {
    const hits: string[] = [];
    for (const file of walkTsFiles(SRC_ROOT)) {
      if (file.endsWith('.test.ts')) continue;
      const src = readFileSync(file, 'utf8');
      if (!src.includes('feeCharge')) continue;
      const rel = file.slice(SRC_ROOT.length + 1).replace(/\\/g, '/');
      // Comments / docs strings may mention feeCharge; only call sites matter.
      if (/recipes\.feeCharge\s*\(/.test(src)) hits.push(rel);
    }
    expect(hits).toEqual(['metering/meter.ts']);
  });

  it('runtime settleWindow uses product-law stub before meter.settle when off', () => {
    const src = readFileSync(join(SRC_ROOT, 'runtime.ts'), 'utf8');
    expect(src).toMatch(/from '\.\/metering\/product-law\.js'/);
    expect(src).toMatch(/if \(!this\.meteringEnabled\)\s*\{\s*return meteringOffSettlementStub\(/);
    // Gate must precede the only settle call.
    const offIdx = src.indexOf('meteringOffSettlementStub');
    const settleIdx = src.indexOf('this.meter.settle');
    expect(offIdx).toBeGreaterThan(-1);
    expect(settleIdx).toBeGreaterThan(offIdx);
  });

  it('settleSession only settles via settleWindow (inherits metering-off gate)', () => {
    const src = readFileSync(join(SRC_ROOT, 'runtime.ts'), 'utf8');
    expect(src).toMatch(/async settleSession[\s\S]*?results\.push\(await this\.settleWindow/);
    expect(src).not.toMatch(/async settleSession[\s\S]*?this\.meter\.settle/);
  });

  it('think path meters only through shouldMeterUsage', () => {
    const src = readFileSync(join(SRC_ROOT, 'runtime.ts'), 'utf8');
    expect(src).toMatch(/const shouldMeter = shouldMeterUsage\(session\.metered, this\.meteringEnabled\)/);
    expect(src).toMatch(/if \(shouldMeter && \(await this\.meter\.hasRequest/);
    expect(src).toMatch(/if \(shouldMeter\)[\s\S]*?this\.meter\.record/);
  });

  it('env kill-switch documents D26-P1-A6 audit-only forever', () => {
    const src = readFileSync(join(SRC_ROOT, 'env.ts'), 'utf8');
    expect(src).toMatch(/AGENTS_METERING_ENABLED/);
    expect(src).toMatch(/D26-P1-A6/);
    expect(src).toMatch(/audit-only forever/);
    expect(src).toMatch(/Dual-write of usage_records while off is forbidden/);
  });

  it('runtime suite pins behavioural no silent feeCharge proofs', () => {
    const testSrc = readFileSync(join(SRC_ROOT, 'runtime.test.ts'), 'utf8');
    expect(testSrc).toContain('metering-off settle refuses feeCharge for windows left from metering-on');
    expect(testSrc).toContain('metering-off allows the same requestId twice and never invents request_id_replay');
    expect(testSrc).toMatch(/keeps the audit when billing is off|records usage even when billing is switched off/);
    // settleSession inherits the gate — leftover windows must stay unbilled via both APIs.
    expect(testSrc).toContain('metering-off settleSession also refuses feeCharge for leftover windows');
  });
});
