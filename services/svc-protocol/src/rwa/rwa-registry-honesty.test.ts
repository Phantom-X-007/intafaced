/**
 * S-G4 honesty — register refuses until a non-zero licence hash is constructed.
 * Licence *content* stays Class X.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', '..', 'contracts/rwa/RwaRegistry.sol'), 'utf8');

describe('S-G4 RWA registry — licence refuse-closed', () => {
  it('licenceHash is immutable; zero hash reverts LicenceUnset on register', () => {
    expect(src).toMatch(/bytes32 public immutable licenceHash/);
    expect(src).toMatch(/if \(licenceHash == bytes32\(0\)\) revert LicenceUnset/);
    expect(src).not.toMatch(/function\s+setLicence/);
    expect(src).not.toMatch(/\bonlyAdmin\b/);
    expect(src).not.toMatch(/function\s+pause/);
    expect(src).not.toMatch(/function\s+upgradeTo/);
  });

  it('ABI has register/unlist and no admin licence switch', () => {
    const names = loadArtifact('RwaRegistry')
      .abi.filter((item) => item.type === 'function')
      .map((item) => item.name)
      .sort();
    expect(names).toContain('register');
    expect(names).toContain('unlist');
    expect(names).not.toContain('setLicence');
    expect(names).not.toContain('setAdmin');
    expect(names).not.toContain('pause');
  });
});
