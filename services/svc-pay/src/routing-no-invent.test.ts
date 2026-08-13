import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Routing residual — no invent costs / approval rates (Nitro §8 blanks).
 *
 * Pure source pins so the suite does not need package builds. Behaviour of
 * sandbox-key routing is covered in sandbox-key-routing.test.ts.
 */

const here = dirname(fileURLToPath(import.meta.url));

describe('routing — no invent costs or approval rates', () => {
  it('source tree does not define costBps / approvalRate decision fields', () => {
    // Ban-list constants in routing-inputs.ts intentionally name these tokens —
    // pin decision modules only (no property/field definitions of invent scores).
    const files = ['sandbox-key-routing.ts', 'rails/posture.ts', 'payment-service.ts', 'router.ts', 'routing/decide.ts'];
    for (const f of files) {
      const src = readFileSync(join(here, f), 'utf8');
      expect(src, f).not.toMatch(/\bapprovalRate\s*[:=]/);
      expect(src, f).not.toMatch(/\bcostBps\s*[:=]/);
      expect(src, f).not.toMatch(/\bapproval_rate\s*[:=]/);
    }
  });

  it('posture selector has no score field assignments', () => {
    const src = readFileSync(join(here, 'rails/posture.ts'), 'utf8');
    expect(src).not.toMatch(/approvalRate\s*[:=]/);
    expect(src).not.toMatch(/costBps\s*[:=]/);
  });
});
