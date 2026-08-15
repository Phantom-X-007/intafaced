/**
 * Unit card — production must not ship a 10x leverage cap
 * 1. Promise: initial-margin.ts has no DEFAULT_MAX_LEVERAGE; live host omits a number
 * 2. Break: export const DEFAULT_MAX_LEVERAGE = '10' or compose pins 10
 * 3. Done bar: unset env/compose; example commented with no value; live parseConfiguredMaxLeverage
 * 4. Class N
 * 5. Paths: initial-margin.ts · env.ts · index.ts · docker-compose.apps.yml · .env.example
 * 6. RED: DEFAULT_MAX_LEVERAGE = '10'
 * 7. Collision: none
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

describe('production does not invent a 10x leverage cap', () => {
  it('initial-margin.ts has no DEFAULT_MAX_LEVERAGE table', () => {
    expect(production).not.toMatch(/DEFAULT_MAX_LEVERAGE/);
    expect(production).toMatch(/LEVERAGE_CAP_UNSET/);
  });

  it('env.ts defaults the cap to empty', () => {
    expect(envSrc).toMatch(/TRADE_FUTURES_MAX_LEVERAGE:\s*z\.string\(\)\.default\(''\)/);
  });

  it('compose passes through empty rather than pinning 10', () => {
    expect(compose).toMatch(/TRADE_FUTURES_MAX_LEVERAGE:\s*\$\{TRADE_FUTURES_MAX_LEVERAGE:-\}/);
    expect(compose).not.toMatch(/TRADE_FUTURES_MAX_LEVERAGE:\s*\$\{TRADE_FUTURES_MAX_LEVERAGE:-10/);
  });

  it('.env.example documents the key without assigning a cap', () => {
    expect(envExample).toMatch(/# TRADE_FUTURES_MAX_LEVERAGE=/);
    expect(envExample).not.toMatch(/^TRADE_FUTURES_MAX_LEVERAGE=/m);
  });

  it('live host parses env and does not pass a literal 10x', () => {
    expect(indexSrc).toMatch(/parseConfiguredMaxLeverage\(env\.TRADE_FUTURES_MAX_LEVERAGE\)/);
    expect(indexSrc).not.toMatch(/maxLeverage:\s*parseAmount\(['"]10['"]\)/);
  });
});
