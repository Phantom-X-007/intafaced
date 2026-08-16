/**
 * Unit card — compose stack passes loans kill-switches into svc-bank
 *
 * 1. Promise: BANK_LOANS_ENABLED from host `.env` reaches the container
 *    (env.ts already declares it, default true). Sweep flag also reaches,
 *    default OFF so a host cannot inherit a schema flip that sells collateral.
 * 2. Break: compose booted bank without BANK_LOANS_ENABLED → operator stop
 *    is a no-op; without an explicit false default, sweep could inherit ON.
 * 3. Done bar: docker-compose.apps.yml svc-bank has
 *    BANK_LOANS_ENABLED: ${BANK_LOANS_ENABLED:-true} and
 *    LOAN_RISK_SWEEP_ENABLED: ${LOAN_RISK_SWEEP_ENABLED:-false}
 * 4. Class N
 * 5. Paths: docker-compose.apps.yml (svc-bank block only)
 * 6. RED: pin fails if either name drops off the svc-bank service block or
 *    the sweep default flips to true
 * 7. Collision: jobs-compose-pin.test.ts — this pin only names loans keys
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

describe('compose loans kill-switches for svc-bank', () => {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const envTs = readFileSync(join(ROOT, 'services/svc-bank/src/env.ts'), 'utf8');
  const block = bankServiceBlock(compose);

  it('env.ts still declares BANK_LOANS_ENABLED default true and sweep default false', () => {
    expect(envTs).toMatch(/BANK_LOANS_ENABLED:\s*z/);
    const loansSlice = envTs.slice(envTs.indexOf('BANK_LOANS_ENABLED:'));
    expect(loansSlice.slice(0, 400)).toMatch(/\.default\(\s*true\s*\)/);

    expect(envTs).toMatch(/LOAN_RISK_SWEEP_ENABLED:\s*z/);
    const sweepSlice = envTs.slice(envTs.indexOf('LOAN_RISK_SWEEP_ENABLED:'));
    expect(sweepSlice.slice(0, 400)).toMatch(/\.default\(\s*false\s*\)/);
  });

  it('compose svc-bank block is the unique home of both keys', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-bank/);
    expect(block).toMatch(/BANK_LOANS_ENABLED:\s*\$\{BANK_LOANS_ENABLED:-true\}/);
    expect(block).toMatch(/LOAN_RISK_SWEEP_ENABLED:\s*\$\{LOAN_RISK_SWEEP_ENABLED:-false\}/);

    const loansHits = compose.match(/^\s+BANK_LOANS_ENABLED:/gm) ?? [];
    const sweepHits = compose.match(/^\s+LOAN_RISK_SWEEP_ENABLED:/gm) ?? [];
    expect(loansHits, 'BANK_LOANS_ENABLED must appear once (svc-bank only)').toHaveLength(1);
    expect(sweepHits, 'LOAN_RISK_SWEEP_ENABLED must appear once (svc-bank only)').toHaveLength(1);
  });

  it('does not invent LTV, a price source, or a liquidation venue on the compose block', () => {
    expect(block).not.toMatch(/LOAN_LTV|MAX_LTV|LIQUIDATION_VENUE|LOAN_PRICE_SOURCE/i);
    expect(block).not.toMatch(/LOAN_RISK_SWEEP_ENABLED:\s*\$\{LOAN_RISK_SWEEP_ENABLED:-true\}/);
  });
});
