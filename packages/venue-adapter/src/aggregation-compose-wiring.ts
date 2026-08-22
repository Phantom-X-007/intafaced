/**
 * venue.aggregation OMS wire — svc-execution fleet compose checks.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function executionComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-execution:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-execution service block missing from docker-compose.apps.yml');
  return match[0];
}

export function venueOmsWireSvcExecutionComposeWired(): boolean {
  const block = executionComposeBlock();
  return /EXECUTION_VENUE_IDS:\s*\$\{EXECUTION_VENUE_IDS:-binance-spot,bybit-spot,okx-spot\}/.test(block);
}

export function venueOperatorCredentialEnvLiveComposeWired(): boolean {
  const block = executionComposeBlock();
  return (
    /VENUE_AGGREGATION_BINANCE_SPOT_API_KEY:/.test(block) &&
    /VENUE_AGGREGATION_BYBIT_SPOT_API_SECRET:/.test(block) &&
    /VENUE_AGGREGATION_OKX_SPOT_PASSPHRASE:/.test(block)
  );
}
