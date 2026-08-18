/**
 * S-L4 honesty — hermetic. Vesting has no admin unlock. Reputation cannot
 * issue a clean badge over empty history.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, '..', '..', 'contracts');

function abiFnNames(name: 'LaunchVesting' | 'DeployerReputation' | 'LaunchLpLock'): string[] {
  const names: string[] = [];
  for (const item of loadArtifact(name).abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

describe('S-L4 honesty · vesting + reputation cannot lie', () => {
  it('LaunchVesting has no revoke / admin / early unlock', () => {
    const src = readFileSync(join(contractsDir, 'trust/LaunchVesting.sol'), 'utf8');
    expect(src).not.toMatch(/function\s+revoke\b/);
    expect(src).not.toMatch(/function\s+pause\b/);
    expect(src).not.toMatch(/\bonlyOwner\b/);
    expect(src).toMatch(/function vested\(/);
    expect(src).toMatch(/function claim\(/);
    const names = abiFnNames('LaunchVesting');
    for (const forbidden of ['revoke', 'setBeneficiary', 'setDuration', 'pause', 'rescue']) {
      expect(names, `leaked control: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('DeployerReputation ABI is counts only — no isSafe / score / clean badge', () => {
    const src = readFileSync(join(contractsDir, 'trust/DeployerReputation.sol'), 'utf8');
    expect(src).toMatch(/NO score/);
    expect(src).not.toMatch(/function\s+(isSafe|isTrusted|score|badge)\b/);
    const names = abiFnNames('DeployerReputation');
    for (const forbidden of ['isSafe', 'isTrusted', 'score', 'badge', 'grade', 'clean']) {
      expect(names, `false-assurance surface: ${forbidden}`).not.toContain(forbidden);
    }
    expect(names).toContain('facts');
    expect(names).toContain('registerLock');
    expect(names).toContain('registerVesting');
  });

  it('LaunchLpLock still has immutable unlockTime and no admin exit', () => {
    const names = abiFnNames('LaunchLpLock');
    expect(names).toContain('unlockTime');
    expect(names).toContain('claim');
    expect(names).not.toContain('unlockEarly');
    expect(names).not.toContain('setUnlockTime');
  });
});
