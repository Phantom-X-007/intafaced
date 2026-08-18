import { describe, expect, it } from 'vitest';
import { keccak256, stringToHex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { subjectCommitment } from './commitment.js';

describe('S-F1 subject commitment — keccak256 of a user-chosen salt', () => {
  it('hashes only the salt, not identity fields', () => {
    const salt = keccak256(stringToHex('user-chosen-salt-fixture'));
    expect(subjectCommitment(salt)).toBe(keccak256(salt));
    expect(subjectCommitment).toHaveLength(1);
  });

  it('two salts produce different commitments; same salt is stable', () => {
    const a = subjectCommitment(keccak256(stringToHex('salt-a')));
    const b = subjectCommitment(keccak256(stringToHex('salt-b')));
    expect(a).not.toBe(b);
    expect(a).toBe(subjectCommitment(keccak256(stringToHex('salt-a'))));
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('RankAttestation ABI has no identity / admin / platform-issuer surface', () => {
    const artefact = loadArtifact('RankAttestation');
    const fnNames = artefact.abi.filter((item) => item.type === 'function').map((item) => item.name);
    expect(fnNames).toEqual(expect.arrayContaining(['attest', 'revoke', 'attestations', 'MAX_RANK']));
    for (const forbidden of ['email', 'name', 'userId', 'kyc', 'setUser', 'setAdmin', 'setIssuer', 'platformIssuer', 'owner', 'pause']) {
      expect(fnNames, `leaked identity/control: ${forbidden}`).not.toContain(forbidden);
    }

    const event = artefact.abi.find((item) => item.type === 'event' && item.name === 'Attested');
    expect(event, 'Attested event missing').toBeDefined();
    if (!event || !('inputs' in event)) throw new Error('unreachable');
    const fieldNames = event.inputs.map((input) => input.name);
    expect(fieldNames).toEqual(['commitment', 'issuer', 'rank', 'expiresAt', 'schemaId']);
    for (const forbidden of ['email', 'name', 'userId', 'kyc', 'address', 'handle']) {
      expect(fieldNames).not.toContain(forbidden);
    }
  });
});
