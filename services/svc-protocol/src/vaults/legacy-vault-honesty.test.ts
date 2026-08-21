/**
 * S-L2 honesty — hermetic. Platform is never a guardian (S-K7 ADR).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', '..', 'contracts/vaults/LegacyVault.sol'), 'utf8');

function abiFnNames(): string[] {
  const names: string[] = [];
  for (const item of loadArtifact('LegacyVault').abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

describe('S-L2 honesty · never a platform guardian', () => {
  it('source has no guardian / platform recovery surface', () => {
    expect(src).not.toMatch(/function\s+pause\b/);
    expect(src).not.toMatch(/\bonlyAdmin\b/);
    expect(src).not.toMatch(/mapping\s*\(.*[Gg]uardian/);
    expect(src).toMatch(/owner = msg\.sender/);
    expect(src).toMatch(/S-K7/);
  });

  it('ABI is owner + heirs + time-locks only — no setAdmin / addGuardian', () => {
    const names = abiFnNames();
    for (const forbidden of ['pause', 'setAdmin', 'addGuardian', 'setGuardian', 'recover']) {
      expect(names, `leaked control: ${forbidden}`).not.toContain(forbidden);
    }
    for (const required of ['heartbeat', 'setHeirs', 'startSuccession', 'claim', 'deposit', 'withdraw']) {
      expect(names).toContain(required);
    }
  });
});
