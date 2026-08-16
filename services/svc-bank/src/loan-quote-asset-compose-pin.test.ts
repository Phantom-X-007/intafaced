/**
 * Unit card — compose stack passes loan quote asset id into svc-bank
 *
 * 1. Promise: LOAN_QUOTE_ASSET_ID from host `.env` reaches the container
 *    (env.ts already defaults USDT — the mark asset for loan LTV).
 * 2. Break: compose booted bank without the name → host pin is a no-op and
 *    the process keeps the schema-only default forever.
 * 3. Done bar: docker-compose.apps.yml svc-bank has
 *    LOAN_QUOTE_ASSET_ID: ${LOAN_QUOTE_ASSET_ID:-USDT}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-bank block only)
 * 6. RED: pin fails if the key drops off, appears twice, or default is not USDT
 * 7. Collision: jwt/cards/loans/ramp/jobs/earn/transfer-batch compose pins —
 *    this pin does not restamp JWT_*, TRANSFER_BATCH_SIZE, LOAN_ACCRUAL_ENABLED,
 *    BANK_LOANS_ENABLED, BANK_CARDS_ENABLED, BANK_RAMP_MODE, BANK_CARD_ISSUER,
 *    TRADE_URL, or INTEREST_ACCRUAL; does not add LOAN_SWEEP_BATCH_SIZE or
 *    turn LOAN_RISK_SWEEP on
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function bankServiceBlock(source: string): string {
  const match = source.match(/^  svc-bank:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-bank service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const LINE = /^\s+LOAN_QUOTE_ASSET_ID:\s*\$\{LOAN_QUOTE_ASSET_ID:-USDT\}\s*$/gm;
const TTL = /^\s+JWT_ACCESS_TTL_SECONDS:\s*\$\{JWT_ACCESS_TTL_SECONDS:-900\}\s*$/gm;
const ISSUER = /^\s+JWT_ISSUER:\s*\$\{JWT_ISSUER:-intafaced\}\s*$/gm;
const AUDIENCE = /^\s+JWT_AUDIENCE:\s*\$\{JWT_AUDIENCE:-intafaced\.api\}\s*$/gm;
const TRANSFER_BATCH = /^\s+TRANSFER_BATCH_SIZE:\s*\$\{TRANSFER_BATCH_SIZE:-200\}\s*$/gm;
const LOAN_ACCRUAL = /^\s+LOAN_ACCRUAL_ENABLED:\s*\$\{LOAN_ACCRUAL_ENABLED:-true\}\s*$/gm;
const BANK_LOANS = /^\s+BANK_LOANS_ENABLED:\s*\$\{BANK_LOANS_ENABLED:-true\}\s*$/gm;
const BANK_CARDS = /^\s+BANK_CARDS_ENABLED:\s*\$\{BANK_CARDS_ENABLED:-true\}\s*$/gm;
const BANK_RAMP = /^\s+BANK_RAMP_MODE:\s*\$\{BANK_RAMP_MODE:-none\}\s*$/gm;
const CARD_ISSUER = /^\s+BANK_CARD_ISSUER:\s*\$\{BANK_CARD_ISSUER:-none\}\s*$/gm;
const TRADE_URL = /^\s+TRADE_URL:\s*http:\/\/svc-trade:4004\s*$/gm;
const INTEREST_ACCRUAL = /^\s+INTEREST_ACCRUAL_ENABLED:\s*\$\{INTEREST_ACCRUAL_ENABLED:-true\}\s*$/gm;

describe('compose LOAN_QUOTE_ASSET_ID for svc-bank', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-bank/src/env.ts'), 'utf8');
  const block = bankServiceBlock(compose);

  it('env.ts still declares LOAN_QUOTE_ASSET_ID default USDT', () => {
    expect(envTs).toMatch(/LOAN_QUOTE_ASSET_ID:\s*z\.string\(\)\.default\('USDT'\)/);
  });

  it('compose svc-bank block is the unique home of the key, default USDT', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-bank/);
    expect(block.match(LINE)).toHaveLength(1);
    expect(countAssignments(block, 'LOAN_QUOTE_ASSET_ID')).toBe(1);

    const hits = compose.match(/^\s+LOAN_QUOTE_ASSET_ID:/gm) ?? [];
    expect(hits, 'LOAN_QUOTE_ASSET_ID must appear once (svc-bank only)').toHaveLength(1);
  });

  it('does not invent APY/LTV/mids, restamp sibling bank compose keys, or turn sweep on', () => {
    expect(block.match(TTL)).toHaveLength(1);
    expect(block.match(ISSUER)).toHaveLength(1);
    expect(block.match(AUDIENCE)).toHaveLength(1);
    expect(block.match(TRANSFER_BATCH)).toHaveLength(1);
    expect(block.match(LOAN_ACCRUAL)).toHaveLength(1);
    expect(block.match(BANK_LOANS)).toHaveLength(1);
    expect(block.match(BANK_CARDS)).toHaveLength(1);
    expect(block.match(BANK_RAMP)).toHaveLength(1);
    expect(block.match(CARD_ISSUER)).toHaveLength(1);
    expect(block.match(TRADE_URL)).toHaveLength(1);
    expect(block.match(INTEREST_ACCRUAL)).toHaveLength(1);
    expect(block).not.toMatch(/LOAN_SWEEP_BATCH_SIZE:/);
    expect(block).not.toMatch(/LOAN_RISK_SWEEP_ENABLED:\s*\$\{LOAN_RISK_SWEEP_ENABLED:-true\}/);
    expect(block).not.toMatch(/LOAN_LTV|MAX_LTV|USDT_MID|LOAN_APY/i);
  });
});
