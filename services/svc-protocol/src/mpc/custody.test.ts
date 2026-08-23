import { describe, expect, it } from 'vitest';
import { MpcCustodyRefuseError, MpcCustodyStage1, reconstructSecret, splitSecret } from './custody.js';

describe('MPC custody stage 1 (2-of-3)', () => {
  const holders = ['alice', 'bob', 'carol'] as const;
  const secret = Uint8Array.from([0, 1, 2, 3, 254, 255]);

  it('reconstructs with any two named shares and preserves leading zeroes', () => {
    const shares = splitSecret(secret, holders);
    expect(reconstructSecret([shares[0]!, shares[2]!])).toEqual(secret);
    expect(reconstructSecret([shares[1]!, shares[2]!])).toEqual(secret);
  });

  it('refuses a single named share', () => {
    const shares = splitSecret(secret, holders);
    expect(() => reconstructSecret([shares[0]!])).toThrow(MpcCustodyRefuseError);
    expect(() => reconstructSecret([shares[0]!])).toThrow(/two named shares/);
  });

  it('holds only named participants and refuses unknown holders', () => {
    const custody = new MpcCustodyStage1(holders);
    const shares = splitSecret(secret, holders);
    custody.hold(shares[0]!);
    expect(() => custody.reconstruct()).toThrow(/two named shares/);
    expect(() => custody.hold({ ...shares[1]!, holder: 'mallory' })).toThrow(/unknown holder/);
    custody.hold(shares[1]!);
    expect(custody.reconstruct()).toEqual(secret);
  });

  it('rejects duplicate holder configuration', () => {
    expect(() => new MpcCustodyStage1(['alice', 'alice', 'carol'])).toThrow(/distinct/);
  });
});
