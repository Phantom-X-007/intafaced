/**
 * trade.copy fleet compose wiring — fee-share + jurisdiction owner env pass-through.
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

export function copyFeeShareLawComposeWired(): boolean {
  const block = tradeComposeBlock();
  return /TRADE_COPY_FEE_SHARE_LAW:\s*\$\{TRADE_COPY_FEE_SHARE_LAW:-\}/.test(block);
}

export function copyJurisdictionLawComposeWired(): boolean {
  const block = tradeComposeBlock();
  return /TRADE_COPY_JURISDICTION_LAW:\s*\$\{TRADE_COPY_JURISDICTION_LAW:-\}/.test(block);
}

export function copyOwnerLawComposeGapsClosed(): boolean {
  return copyFeeShareLawComposeWired() && copyJurisdictionLawComposeWired();
}
