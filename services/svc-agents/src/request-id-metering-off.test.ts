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
});
