/**
 * Unit card — production ships DIRECTION §1 10× (D26-P0-07)
 * 1. Promise: blank owner cap stays null and money paths refuse
 * 2. Break: restore any production fallback magnitude
 * 3. Done bar: index passes parsed nullable cap; compose stays empty
 * 4. Class N
 * 5. Paths: initial-margin.ts · env.ts · index.ts · docker-compose.apps.yml · .env.example
 * 6. RED: blank resolves to a number or LEVERAGE_CAP_UNSET disappears
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

describe('production refuses an unset owner leverage cap', () => {
  it('initial-margin.ts names the typed refusal and no default magnitude', () => {
    expect(production).not.toMatch(/DEFAULT_MAX_LEVERAGE/);
    expect(production).toMatch(/LEVERAGE_CAP_UNSET = 'trade\.leverage_cap_unset'/);
  });

  it('env.ts leaves the owner source empty', () => {
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

  it('live host preserves the nullable parse result', () => {
    expect(indexSrc).toMatch(/const maxLeverage = parseConfiguredMaxLeverage\(env\.TRADE_FUTURES_MAX_LEVERAGE\)/);
    expect(indexSrc).not.toMatch(/resolveMaxLeverage\(parseConfiguredMaxLeverage/);
  });
});
