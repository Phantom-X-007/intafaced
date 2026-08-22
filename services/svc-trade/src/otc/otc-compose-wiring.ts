/**
 * trade.otc fleet compose wiring — desk-law owner env pass-through honesty checks.
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

export function otcDeskLawComposeWired(): boolean {
  const block = tradeComposeBlock();
  return /TRADE_OTC_DESK_LAW:\s*\$\{TRADE_OTC_DESK_LAW:-\}/.test(block);
}
