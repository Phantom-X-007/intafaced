/**
 * S-A1 honesty — hermetic. Platform is never a guardian (socket.social-recovery).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', '..', 'contracts/recovery/UserElectedRecovery.sol'), 'utf8');

function abiFnNames(): string[] {
  const names: string[] = [];
  for (const item of loadArtifact('UserElectedRecovery').abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

describe('S-A1 honesty · never a platform guardian', () => {
  it('source elects guardians by the current owner only; no admin / upgrade / platform key', () => {
    expect(src).not.toMatch(/function\s+pause\b/);
    expect(src).not.toMatch(/\bonlyAdmin\b/);
    expect(src).not.toMatch(/\bupgradeTo\b/);
    expect(src).not.toMatch(/\bUUPSUpgradeable\b/);
    expect(src).not.toMatch(/address\s*\(\s*0x[a-fA-F0-9]{40}\s*\)/);
    expect(src.toLowerCase()).not.toMatch(/intafaced/);
    expect(src).toMatch(/function addGuardian\(address guardian\) external onlyOwner/);
    expect(src).toMatch(/function removeGuardian\(address guardian\) external onlyOwner/);
    expect(src).toMatch(/function cancelRecovery\(\) external onlyOwner/);
    expect(src).toMatch(/guardian == address\(0\) \|\| guardian == address\(this\)/);
  });

  it('ABI is owner + user-elected guardians + delay recovery — no setAdmin', () => {
    const names = abiFnNames();
    for (const forbidden of ['pause', 'setAdmin', 'upgradeTo', 'upgradeToAndCall', 'transferOwnership']) {
      expect(names, `leaked control: ${forbidden}`).not.toContain(forbidden);
    }
    for (const required of [
      'addGuardian',
      'removeGuardian',
      'setThreshold',
      'proposeRecovery',
      'approveRecovery',
      'cancelRecovery',
      'executeRecovery',
      'isValidSignature',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('constructor takes only the user owner and delay — no platform argument', () => {
    const ctor = loadArtifact('UserElectedRecovery').abi.find((item) => item.type === 'constructor');
    expect(ctor && 'inputs' in ctor ? ctor.inputs.map((i) => i.type) : []).toEqual(['address', 'uint64']);
  });
});
