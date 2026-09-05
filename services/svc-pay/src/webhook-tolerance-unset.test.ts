import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Owner signed-webhook replay window is refuse-closed when unset.
 *
 * `z.coerce.number().default(300)` treated blank skew env as a published
 * 300s replay window. Blank is unset; 300 only when the owner publishes it.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('PAY_WEBHOOK_TOLERANCE_SECONDS unset refuse', () => {
  it('env.ts does not default blank to 300', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-pay/src/env.ts'), 'utf8');
    expect(envTs).toMatch(/PAY_WEBHOOK_TOLERANCE_SECONDS:\s*z\.coerce\.number\(\)\.int\(\)\.min\(30\),/);
    expect(envTs).not.toMatch(/PAY_WEBHOOK_TOLERANCE_SECONDS:[\s\S]{0,80}\.default\(300\)/);
  });

  it('compose refuses missing — never a baked 300', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const start = compose.indexOf('\n  svc-pay:');
    const rest = compose.slice(start + 1);
    const next = rest.search(/\n  svc-[a-z]+:/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toMatch(/PAY_WEBHOOK_TOLERANCE_SECONDS:\s*\$\{PAY_WEBHOOK_TOLERANCE_SECONDS:\?missing — copy \.env\.example to \.env\}/);
    expect(block).not.toMatch(/PAY_WEBHOOK_TOLERANCE_SECONDS:\s*\$\{PAY_WEBHOOK_TOLERANCE_SECONDS:-300\}/);
    expect(block).not.toMatch(/PAY_WEBHOOK_TOLERANCE_SECONDS:\s*['"]?300/);
  });

  it('inbound rails do not invent 300', () => {
    const card = readFileSync(join(ROOT, 'services/svc-pay/src/rails/card-sandbox.ts'), 'utf8');
    const crypto = readFileSync(join(ROOT, 'services/svc-pay/src/rails/crypto-native.ts'), 'utf8');
    expect(card).not.toMatch(/toleranceSeconds \?\? 300/);
    expect(crypto).not.toMatch(/toleranceSeconds \?\? 300/);
    expect(card).toMatch(/readonly toleranceSeconds: number;/);
    expect(crypto).toMatch(/readonly toleranceSeconds: number;/);
  });
});
