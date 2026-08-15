/**
 * Unit card — live re-leverage is NotSupported, not a retryable throttle
 * 1. Promise: POST /positions/leverage and /margin-mode use notSupported
 * 2. Break: those doors call rateLimited so bots retry with backoff
 * 3. Done bar: derivativesNotSupported helper sends notSupported; no rateLimited
 * 4. Class N
 * 5. Paths: svc-trade/src/private-rest.ts
 * 6. RED: rateLimited( inside derivativesNotSupported
 * 7. Collision: none — #1929 pins grace on GET margin-call; this pins 501 leverage
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'private-rest.ts'), 'utf8');

describe('live re-leverage is NotSupported, not retryable', () => {
  it('POST leverage and margin-mode use the derivativesNotSupported helper', () => {
    expect(src).toMatch(/app\.post\('\/api\/v1\/positions\/leverage',\s*derivativesNotSupported\('setLeverage'/);
    expect(src).toMatch(/app\.post\('\/api\/v1\/positions\/margin-mode',\s*derivativesNotSupported\('setMarginMode'/);
  });

  it('the helper sends notSupported, not rateLimited', () => {
    const helper = src.match(/const derivativesNotSupported[\s\S]*?^\s*\};/m)?.[0] ?? '';
    expect(helper).toMatch(/notSupported\(/);
    expect(helper).not.toMatch(/rateLimited\(/);
  });
});
