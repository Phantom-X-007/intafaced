/**
 * Unit card — production ships DIRECTION §1 10× (D26-P0-07)
 * 1. Promise: DEFAULT_MAX_LEVERAGE = '10'; empty env is that cap, not refuse-unset
 * 2. Break: remove DEFAULT_MAX_LEVERAGE or restore trade.leverage_cap_unset on omit
 * 3. Done bar: resolveMaxLeverage in live host; compose empty (no pin 20); example commented
 * 4. Class N
 * 5. Paths: initial-margin.ts · env.ts · index.ts · docker-compose.apps.yml · .env.example
 * 6. RED: LEVERAGE_CAP_UNSET or no DEFAULT_MAX_LEVERAGE
 * 7. Collision: none — restores ADR 2026-08-13 after #1942 overshot
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');
const production = readFileSync(join(here, 'initial-margin.ts'), 'utf8');
const indexSrc = readFileSync(join(here, '..', 'index.ts'), 'utf8');
const envSrc = readFileSync(join(root, 'services/svc-trade/src/env.ts'), 'utf8');
const compose = readFileSync(join(root, 'docker-compose.apps.yml'), 'utf8');
const envExample = readFileSync(join(root, '.env.example'), 'utf8');

describe('production ships DIRECTION §1 10× (D26-P0-07)', () => {
  it('initial-margin.ts exports DEFAULT_MAX_LEVERAGE = 10 and does not refuse-unset', () => {
    expect(production).toMatch(/export const DEFAULT_MAX_LEVERAGE = '10'/);
    expect(production).not.toMatch(/LEVERAGE_CAP_UNSET/);
    expect(production).not.toMatch(/leverage_cap_unset/);
  });

  it('env.ts defaults the override to empty (code fills 10×)', () => {
    expect(envSrc).toMatch(/TRADE_FUTURES_MAX_LEVERAGE:\s*z\.string\(\)\.default\(''\)/);
  });

  it('compose passes through empty rather than pinning a raise', () => {
    expect(compose).toMatch(/TRADE_FUTURES_MAX_LEVERAGE:\s*\$\{TRADE_FUTURES_MAX_LEVERAGE:-\}/);
    expect(compose).not.toMatch(/TRADE_FUTURES_MAX_LEVERAGE:\s*\$\{TRADE_FUTURES_MAX_LEVERAGE:-20/);
  });

  it('.env.example documents the key without assigning a raise', () => {
    expect(envExample).toMatch(/# TRADE_FUTURES_MAX_LEVERAGE=/);
    expect(envExample).not.toMatch(/^TRADE_FUTURES_MAX_LEVERAGE=/m);
  });

  it('live host resolves empty env to the DIRECTION cap', () => {
    expect(indexSrc).toMatch(/resolveMaxLeverage\(parseConfiguredMaxLeverage\(env\.TRADE_FUTURES_MAX_LEVERAGE\)\)/);
    expect(production).toMatch(/above 10. is a raise/);
  });
});
