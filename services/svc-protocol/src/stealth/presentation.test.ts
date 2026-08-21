import { describe, expect, it } from 'vitest';
import { keccak256, stringToHex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { presentationAddress, STEALTH_SCHEME_ID } from './presentation.js';

const spending = keccak256(stringToHex('spending-key-id-fixture'));

describe('S-L3 stealth handles — unlinkable presentations', () => {
  it('two ephemerals for one human are different addresses, neither is the spending key', () => {
    const a = presentationAddress(spending, keccak256(stringToHex('ephemeral-a')));
    const b = presentationAddress(spending, keccak256(stringToHex('ephemeral-b')));
    expect(a).not.toBe(b);
    expect(a.toLowerCase()).not.toBe(spending.slice(0, 42).toLowerCase());
    expect(STEALTH_SCHEME_ID).toBe(1n);
  });

  it('announcer has no identity / admin surface (indexer stays aggregate-only)', () => {
    const names = loadArtifact('StealthAnnouncer')
      .abi.filter((item) => item.type === 'function')
      .map((item) => item.name);
    expect(names).toEqual(['announce']);
    for (const forbidden of ['pause', 'setAdmin', 'setUser', 'setProfile', 'onlyOwner']) {
      expect(names, `leaked control: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
