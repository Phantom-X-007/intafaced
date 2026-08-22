/**
 * trade.forex fleet compose wiring — P0-05 settlement asset law pass-through.
 *
 * Forex shares `TRADE_OPTIONS_SETTLEMENT_ASSET_LAW` with options (D26-P0-05).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export function tradeComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-trade:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-trade service block missing from docker-compose.apps.yml');
  return match[0];
}

export function forexSettlementAssetLawComposeWired(): boolean {
  const block = tradeComposeBlock();
  return /TRADE_OPTIONS_SETTLEMENT_ASSET_LAW:\s*\$\{TRADE_OPTIONS_SETTLEMENT_ASSET_LAW:-\}/.test(block);
}

export function forexOwnerEnvComposeGapsClosed(): boolean {
  return forexSettlementAssetLawComposeWired();
}
