import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import {
  CERT_PROGRAM_UNSET,
  CERTIFIED_UNPUBLISHED,
  TESTNET_PARITY_UNPUBLISHED,
  installCertRefuse,
  type CertClaimInput,
  type CertClaimResult,
} from './cert-refuse.js';

installCertRefuse();

/**
 * CARD C6 hitch. Refuse certified / testnet-parity claims without a published
 * rulebook version and an owner program. Do not fake a cert suite. Do not invent a version.
 */

type CertEngine = MatchingEngine & {
  claimCertified(input?: CertClaimInput): CertClaimResult;
  claimTestnetParity(input?: CertClaimInput): CertClaimResult;
};

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as CertEngine;
  return { journal, bus, engine };
}

function inventedVersion(result: CertClaimResult): boolean {
  const dumped = JSON.stringify(result);
  if (dumped.includes('"v1"') || dumped.includes('"latest"') || dumped.includes('"GTC"')) return true;
  const version = (result as { rulebookVersion?: string }).rulebookVersion;
  return version === 'v1' || version === 'latest' || version === 'GTC';
}

function fakedSuite(result: CertClaimResult): boolean {
  if (result.suite !== null) return true;
  const dumped = JSON.stringify(result);
  if (dumped.includes('"passed"') || dumped.includes('"tests"')) return true;
  return (result as { certified?: boolean }).certified === true;
}

describe('cert / testnet-parity refuse — no invented version, no faked suite', () => {
  it('claimCertified with blank version refuses certified_unpublished; no invented version', () => {
    const { engine } = build();
    for (const input of [{}, { rulebookVersion: '' }, { rulebookVersion: '   ' }, { rulebookVersion: null }]) {
      const refused = engine.claimCertified(input);
      expect(refused.accepted).toBe(false);
      if (refused.accepted) return;
      expect(refused.rejected.code).toBe(CERTIFIED_UNPUBLISHED);
      expect(refused.suite).toBeNull();
      expect(refused).not.toHaveProperty('rulebookVersion');
      expect(inventedVersion(refused)).toBe(false);
      expect((refused as { certified?: boolean }).certified).not.toBe(true);
    }
  });

  it('claimCertified with version but blank program refuses cert_program_unset; no fake suite', () => {
    const { engine } = build();
    const ownerVersion = 'owner-rulebook-20260903';
    for (const program of ['', '   ', null, undefined]) {
      const refused = engine.claimCertified({ rulebookVersion: ownerVersion, program });
      expect(refused.accepted).toBe(false);
      if (refused.accepted) return;
      expect(refused.rejected.code).toBe(CERT_PROGRAM_UNSET);
      expect(refused.suite).toBeNull();
      expect(refused.rulebookVersion).toBe(ownerVersion);
      expect(fakedSuite(refused)).toBe(false);
      expect(inventedVersion(refused)).toBe(false);
    }
  });

  it('claimTestnetParity with blank version refuses testnet_parity_unpublished; blank program refuses cert_program_unset', () => {
    const { engine } = build();
    const unpublished = engine.claimTestnetParity({ rulebookVersion: '' });
    expect(unpublished.accepted).toBe(false);
    if (unpublished.accepted) return;
    expect(unpublished.rejected.code).toBe(TESTNET_PARITY_UNPUBLISHED);
    expect(unpublished.suite).toBeNull();
    expect(unpublished).not.toHaveProperty('rulebookVersion');
    expect(inventedVersion(unpublished)).toBe(false);

    const ownerVersion = 'owner-rulebook-20260903';
    const unset = engine.claimTestnetParity({ rulebookVersion: ownerVersion, program: '' });
    expect(unset.accepted).toBe(false);
    if (unset.accepted) return;
    expect(unset.rejected.code).toBe(CERT_PROGRAM_UNSET);
    expect(unset.suite).toBeNull();
    expect(unset.rulebookVersion).toBe(ownerVersion);
    expect(fakedSuite(unset)).toBe(false);
  });

  it('both set accepts published names with suite null; version echoed as given, not invented', () => {
    const { engine } = build();
    const ownerVersion = 'owner-rulebook-20260903';
    const ownerProgram = 'owner-cert-program';
    const certified = engine.claimCertified({ rulebookVersion: ownerVersion, program: ownerProgram });
    expect(certified.accepted).toBe(true);
    if (!certified.accepted) return;
    expect(certified.unpublished).toBe(false);
    expect(certified.rulebookVersion).toBe(ownerVersion);
    expect(certified.program).toBe(ownerProgram);
    expect(certified.suite).toBeNull();
    expect(certified).not.toHaveProperty('certified');
    expect((certified as { certified?: boolean }).certified).not.toBe(true);
    expect(fakedSuite(certified)).toBe(false);

    const parity = engine.claimTestnetParity({ rulebookVersion: ownerVersion, program: ownerProgram });
    expect(parity.accepted).toBe(true);
    if (!parity.accepted) return;
    expect(parity.rulebookVersion).toBe(ownerVersion);
    expect(parity.program).toBe(ownerProgram);
    expect(parity.suite).toBeNull();
    expect((parity as { certified?: boolean }).certified).not.toBe(true);
    expect(fakedSuite(parity)).toBe(false);
  });

  it('blank version is not mapped to a GTC-style default or v1', () => {
    const { engine } = build();
    const refused = engine.claimCertified({ rulebookVersion: '', program: 'owner-cert-program' });
    expect(refused.accepted).toBe(false);
    if (refused.accepted) return;
    expect(refused.rejected.code).toBe(CERTIFIED_UNPUBLISHED);
    expect(String(refused.rejected.code)).not.toBe('tif_missing');
    expect(JSON.stringify(refused)).not.toContain('GTC');
    expect(JSON.stringify(refused)).not.toContain('v1');
    expect(JSON.stringify(refused)).not.toContain('latest');
    expect(inventedVersion(refused)).toBe(false);
    expect(refused.suite).toBeNull();
  });
});
