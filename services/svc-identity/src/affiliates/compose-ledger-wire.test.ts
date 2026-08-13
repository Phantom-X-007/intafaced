import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

/** Slice the `svc-identity:` service block out of compose (until the next top-level service). */
function identityComposeBlock(compose: string): string {
  const start = compose.search(/^  svc-identity:/m);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start);
  const next = rest.slice(1).search(/^  [a-z0-9-]+:/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe('ops.affiliates — compose wires identity LEDGER_URL (no localhost invent)', () => {
  it('fleet identity talks to in-network svc-ledger', () => {
    const block = identityComposeBlock(read('docker-compose.apps.yml'));
    expect(block).toMatch(/LEDGER_URL:\s*http:\/\/svc-ledger:4001/);
    expect(block).not.toMatch(/localhost:4001/);
    expect(block).toMatch(/svc-ledger:\s*\n\s+condition:\s*service_healthy/);
  });

  it('schema stays optional with no default — omit URL still refuse-closed', () => {
    const envTs = read('services/svc-identity/src/env.ts');
    const ledgerDecl = envTs.slice(envTs.indexOf('LEDGER_URL:'));
    expect(ledgerDecl).toMatch(/LEDGER_URL:\s*z\.string\(\)\.url\(\)\.optional\(\)/);
    expect(ledgerDecl.slice(0, 120)).not.toMatch(/\.default\(/);
  });
});
