import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { enforcementOf } from '@intafaced/config';

/**
 * Pin: the edge process does not pretend `edge.gateway` gates traffic.
 *
 * The flag is still NOT_ENFORCED in FLAG_REGISTRY. A future agent that wires
 * `isEnabled('edge.gateway')` into the proxy without flipping enforcement would
 * invent a control. Status honesty (admin-api) is allowed to *read* enforcement
 * via `enforcementOf` so the console can say the truth — that is not a gate.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

function productionSources(): string[] {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.ts') && !name.includes('.test.') && !name.includes('.e2e.'))
    .map((name) => join(HERE, name));
}

describe('edge.gateway honesty pin', () => {
  it('registry still reports edge.gateway as unenforced (NOT_ENFORCED)', () => {
    expect(enforcementOf('edge.gateway').kind).toBe('none');
  });

  it('production edge sources never call isEnabled — flags do not gate the door', () => {
    // Comments may mention isEnabled historically; executable import/call must not.
    for (const file of productionSources()) {
      const src = readFileSync(file, 'utf8');
      // Strip block comments then line comments so historical narrative does not trip the pin.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/\bisEnabled\s*\(/);
      expect(code, file).not.toMatch(/from ['"]@intafaced\/config['"][^;]*\bisEnabled\b/);
    }
  });

  it('only admin-api may read enforcementOf for status honesty (not a gate)', () => {
    for (const file of productionSources()) {
      const base = file.split('/').pop()!;
      const src = readFileSync(file, 'utf8');
      if (base === 'admin-api.ts') {
        expect(src).toMatch(/enforcementOf\s*\(\s*['"]edge\.gateway['"]\s*\)/);
        continue;
      }
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, base).not.toMatch(/\benforcementOf\s*\(/);
    }
  });
});
