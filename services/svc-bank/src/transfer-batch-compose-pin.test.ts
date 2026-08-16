/**
 * Unit card — compose stack passes scheduled-transfer batch size into svc-bank
 *
 * 1. Promise: TRANSFER_BATCH_SIZE from host `.env` reaches the container
 *    (env.ts already defaults 200 — how many due schedules one runner pass claims).
 * 2. Break: compose booted bank without the name → operator cannot tighten
 *    scheduled-transfer blast radius from `.env`.
 * 3. Done bar: docker-compose.apps.yml svc-bank has
 *    TRANSFER_BATCH_SIZE: ${TRANSFER_BATCH_SIZE:-200}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-bank block only)
 * 6. RED: pin fails if the key drops off, appears twice, or default is not 200
 * 7. Collision: jobs/earn/loan compose pins — this pin only names TRANSFER_BATCH_SIZE
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

const LINE = /^\s+TRANSFER_BATCH_SIZE:\s*\$\{TRANSFER_BATCH_SIZE:-200\}\s*$/gm;

describe('compose TRANSFER_BATCH_SIZE for svc-bank', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-bank/src/env.ts'), 'utf8');
  const block = bankServiceBlock(compose);

  it('env.ts still declares TRANSFER_BATCH_SIZE default 200', () => {
    expect(envTs).toMatch(/TRANSFER_BATCH_SIZE:\s*z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(10_000\)\.default\(200\)/);
  });

  it('compose svc-bank block is the unique home of the key, default 200', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-bank/);
    expect(block.match(LINE)).toHaveLength(1);

    const hits = compose.match(/^\s+TRANSFER_BATCH_SIZE:/gm) ?? [];
    expect(hits, 'TRANSFER_BATCH_SIZE must appear once (svc-bank only)').toHaveLength(1);
  });

  it('does not invent APY/LTV/mids or restamp sibling bank compose keys', () => {
    expect(block).not.toMatch(/LOAN_SWEEP_BATCH_SIZE:/);
    expect(block).not.toMatch(/LOAN_RISK_SWEEP_ENABLED:\s*\$\{LOAN_RISK_SWEEP_ENABLED:-true\}/);
    expect(block).not.toMatch(/LOAN_LTV|MAX_LTV|USDT_MID|LOAN_APY/i);
  });
});
