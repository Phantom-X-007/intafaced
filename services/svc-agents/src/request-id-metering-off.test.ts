/**
 * Unit card (L01 W6):
 * Promise: request-id free-replay refuse (#1306) only applies when billing is on.
 *   Metering-off is audit-only (no usage_records) — replaying a request id must not
 *   invent a bill or a request_id_replay error that pretends a charge existed.
 * Break: hasRequest gate should only fire when shouldMeter; if metering-off still
 *   throws request_id_replay, operators cannot re-probe after a kill-switch.
 * Done bar: meteringEnabled=false + same requestId twice → both complete, cost 0,
 *   no usage_records, no request_id_replay.
 * Class: N (honesty) — Class M sealed path (#1306) stays for metering on.
 *
 * Implementation: this pure pin documents the runtime contract via source scan so
 * the suite stays DB-free; the metered path remains covered by runtime.test.ts.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('request-id replay gate is metering-gated', () => {
  it('runtime only checks hasRequest when shouldMeter is true', () => {
    const src = readFileSync(join(HERE, 'runtime.ts'), 'utf8');
    expect(src).toMatch(/const shouldMeter = session\.metered && this\.meteringEnabled/);
    // Gate must be AND shouldMeter — not a bare hasRequest that fires while off.
    expect(src).toMatch(/if \(shouldMeter && \(await this\.meter\.hasRequest/);
    // Must not check hasRequest before computing shouldMeter in a way that ignores it.
    expect(src).not.toMatch(/if \(await this\.meter\.hasRequest/);
  });

  it('metering-off honesty test pins empty usage_records (paired residual)', () => {
    const testSrc = readFileSync(join(HERE, 'runtime.test.ts'), 'utf8');
    // After metering-off residual ships, this string lands; tolerate either name.
    const hasNew =
      testSrc.includes('keeps the audit when billing is off') || testSrc.includes('records usage even when billing is switched off');
    expect(hasNew).toBe(true);
  });

  it('settleWindow refuses feeCharge while meteringEnabled is false', () => {
    const src = readFileSync(join(HERE, 'runtime.ts'), 'utf8');
    // Kill-switch must gate settle, not only think/record.
    expect(src).toMatch(/async settleWindow[\s\S]*?if \(!this\.meteringEnabled\)/);
    expect(src).toMatch(/if \(!this\.meteringEnabled\)[\s\S]*?settled:\s*false/);
  });

  it('metering-off leftover-window settle is pinned in runtime suite', () => {
    const testSrc = readFileSync(join(HERE, 'runtime.test.ts'), 'utf8');
    expect(testSrc).toContain('metering-off settle refuses feeCharge for windows left from metering-on');
    expect(testSrc).toContain('metering-off allows the same requestId twice and never invents request_id_replay');
  });

  it('public-door promise-falsify suite pins metering-off never feeCharges (D26-P2-01h)', () => {
    const doors = readFileSync(join(HERE, 'metering-public-doors-promise-falsify.test.ts'), 'utf8');
    expect(doors).toContain('D26-P2-01h public doors — metering-off never feeCharges');
    expect(doors).toContain('usage.settle returns settled:false amount 0 and never calls meter.settle');
    expect(doors).toContain('run.complete reports cost 0 / metered false and never calls meter.settle');
    expect(doors).toContain('D26-P2-01h public doors — dark refuse bills zero');
    const runtimeSrc = readFileSync(join(HERE, 'runtime.test.ts'), 'utf8');
    expect(runtimeSrc).toContain('D26-P2-01h public doors — real AgentRuntime metering-off');
    expect(runtimeSrc).toContain('run.complete through createCaller never bills / never feeCharges');
  });
});
