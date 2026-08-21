/**
 * Unit card — svc-agents money env refuse-closed (S11-1 / S11-3 / S11-4)
 *
 * 1. Promise: unset AGENTS_METERING_ENABLED must NOT bill; unset LEDGER_URL
 *    must refuse (no silent localhost); unset AGENTS_FEE_ASSET_ID must refuse
 *    (no invent IFC).
 * 2. Break: bool.default(true) / LEDGER_URL localhost / fee asset default IFC
 *    still feeCharge or invent an owner asset when the operator never set them.
 * 3. Done bar: this slice parses unset metering → false; unset ledger / fee
 *    asset fail; env.ts source matches (no fail-open defaults).
 * 4. Class M
 * 5. Paths: env.ts (slice below is the same shapes env.ts pins)
 * 6. RED: fail-open defaults return, or unset metering parses as true
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const HERE = dirname(fileURLToPath(import.meta.url));

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase())));

/** Same money-path shapes env.ts must keep (source-pin below). */
const moneySlice = z.object({
  LEDGER_URL: z.string().url(),
  AGENTS_FEE_ASSET_ID: z.string().min(1),
  AGENTS_METERING_ENABLED: z.preprocess(
    (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? false : v),
    bool,
  ),
});

describe('svc-agents money env refuse-closed', () => {
  it('env.ts keeps the refuse-closed shapes this slice parses', () => {
    const envTs = readFileSync(join(HERE, 'env.ts'), 'utf8');
    expect(envTs).not.toMatch(/LEDGER_URL:\s*z\.string\(\)\.url\(\)\.default\('http:\/\/localhost:4001'\)/);
    expect(envTs).toMatch(/LEDGER_URL:\s*z\.string\(\)\.url\(\)/);
    expect(envTs).not.toMatch(/AGENTS_FEE_ASSET_ID:\s*z\.string\(\)\.default\('IFC'\)/);
    expect(envTs).toMatch(/AGENTS_FEE_ASSET_ID:\s*z\.string\(\)\.min\(1\)/);
    expect(envTs).not.toMatch(/AGENTS_METERING_ENABLED:\s*bool\.default\(true\)/);
    expect(envTs).toMatch(/AGENTS_METERING_ENABLED:\s*z\.preprocess\(/);
  });

  it('unset LEDGER_URL refuses (no silent localhost book)', () => {
    const parsed = moneySlice.safeParse({ AGENTS_FEE_ASSET_ID: 'X' });
    expect(parsed.success).toBe(false);
  });

  it('unset AGENTS_FEE_ASSET_ID refuses (no invent IFC)', () => {
    const parsed = moneySlice.safeParse({ LEDGER_URL: 'http://svc-ledger:4001' });
    expect(parsed.success).toBe(false);
  });

  it('blank AGENTS_FEE_ASSET_ID refuses', () => {
    const parsed = moneySlice.safeParse({
      LEDGER_URL: 'http://svc-ledger:4001',
      AGENTS_FEE_ASSET_ID: '',
    });
    expect(parsed.success).toBe(false);
  });

  it('unset AGENTS_METERING_ENABLED must not bill', () => {
    const parsed = moneySlice.parse({
      LEDGER_URL: 'http://svc-ledger:4001',
      AGENTS_FEE_ASSET_ID: 'X',
    });
    expect(parsed.AGENTS_METERING_ENABLED).toBe(false);
  });

  it('blank AGENTS_METERING_ENABLED must not bill', () => {
    const parsed = moneySlice.parse({
      LEDGER_URL: 'http://svc-ledger:4001',
      AGENTS_FEE_ASSET_ID: 'X',
      AGENTS_METERING_ENABLED: '',
    });
    expect(parsed.AGENTS_METERING_ENABLED).toBe(false);
  });

  it('explicit true is owner-on (not invented)', () => {
    const parsed = moneySlice.parse({
      LEDGER_URL: 'http://svc-ledger:4001',
      AGENTS_FEE_ASSET_ID: 'X',
      AGENTS_METERING_ENABLED: 'true',
    });
    expect(parsed.AGENTS_METERING_ENABLED).toBe(true);
    expect(parsed.AGENTS_FEE_ASSET_ID).toBe('X');
    expect(parsed.LEDGER_URL).toBe('http://svc-ledger:4001');
  });
});
