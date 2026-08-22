/**
 * socket.dex-fee-source fleet compose wiring — CLOB fee + settlement owner env pass-through.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export function dexComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-dex:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-dex service block missing from docker-compose.apps.yml');
  return match[0];
}

export function dexClobFeeBpsComposeWired(): boolean {
  const block = dexComposeBlock();
  return /DEX_CLOB_FEE_BPS:\s*\$\{DEX_CLOB_FEE_BPS:-\}/.test(block);
}

export function dexClobSettlementCostComposeWired(): boolean {
  const block = dexComposeBlock();
  return /DEX_CLOB_SETTLEMENT_COST:\s*'\$\{DEX_CLOB_SETTLEMENT_COST:-\}'/.test(block);
}

export function dexFeeOwnerEnvComposeGapsClosed(): boolean {
  return dexClobFeeBpsComposeWired() && dexClobSettlementCostComposeWired();
}
