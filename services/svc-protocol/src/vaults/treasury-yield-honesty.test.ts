/**
 * S-L5 honesty — deposits refuse until a non-zero licence hash is constructed.
 * Licence *content* stays Class X.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', '..', 'contracts/vaults/TreasuryYieldVault.sol'), 'utf8');

describe('S-L5 treasury yield — licence refuse-closed', () => {
  it('licenceHash is immutable; zero hash reverts LicenceUnset on deposit', () => {
    expect(src).toMatch(/bytes32 public immutable licenceHash/);
    expect(src).toMatch(/if \(licenceHash == bytes32\(0\)\) revert LicenceUnset/);
    expect(src).not.toMatch(/function\s+setLicence/);
    expect(src).not.toMatch(/\bonlyAdmin\b/);
  });

  it('ABI has no admin licence switch', () => {
    const names = loadArtifact('TreasuryYieldVault')
      .abi.filter((item) => item.type === 'function')
      .map((item) => item.name)
      .sort();
    expect(names).toContain('deposit');
    expect(names).toContain('withdraw');
    expect(names).not.toContain('setLicence');
    expect(names).not.toContain('setAdmin');
  });
});
