import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Owner ceilings / moderator allowlist only reach the fleet if compose names them.
 * Empty default = unset. Never invent a magnitude or a moderator id.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function p2pComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const start = compose.indexOf('\n  svc-p2p:');
  expect(start, 'svc-p2p service missing from docker-compose.apps.yml').toBeGreaterThanOrEqual(0);
  const rest = compose.slice(start + 1);
  const next = rest.search(/\n  svc-[a-z]+:/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('compose passes p2p.merchants owner flags into svc-p2p', () => {
  const block = p2pComposeBlock();

  it('names offer ceilings with empty default (unset, not a baked number)', () => {
    expect(block).toMatch(/P2P_OFFER_MAX_STANDARD:\s*\$\{P2P_OFFER_MAX_STANDARD:-\}/);
    expect(block).toMatch(/P2P_OFFER_MAX_MERCHANT:\s*\$\{P2P_OFFER_MAX_MERCHANT:-\}/);
    expect(block).not.toMatch(/P2P_OFFER_MAX_STANDARD:\s*\$\{P2P_OFFER_MAX_STANDARD:-unlimited\}/);
    expect(block).not.toMatch(/P2P_OFFER_MAX_MERCHANT:\s*\$\{P2P_OFFER_MAX_MERCHANT:-unlimited\}/);
    expect(block).not.toMatch(/P2P_OFFER_MAX_STANDARD:\s*\$\{P2P_OFFER_MAX_STANDARD:-\d/);
    expect(block).not.toMatch(/P2P_OFFER_MAX_MERCHANT:\s*\$\{P2P_OFFER_MAX_MERCHANT:-\d/);
  });

  it('names moderator allowlist empty on a clean clone', () => {
    expect(block).toMatch(/P2P_MODERATOR_USER_IDS:\s*\$\{P2P_MODERATOR_USER_IDS:-\}/);
  });

  it('names trading kill-switch so host .env can turn offers off', () => {
    expect(block).toMatch(/P2P_TRADING_ENABLED:\s*\$\{P2P_TRADING_ENABLED:-true\}/);
  });
});
