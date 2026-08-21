/**
 * Live wiring for S-A10 / S-A11 / S-A12 policy modules — keeps them reachable
 * from boot (reachability gate) rather than test-only islands.
 */
import { resolveBundler, type BundlerMode } from './bundler-policy.js';
import { decideSponsorship, type SponsorshipPolicy } from './paymaster-policy.js';
import { markFromPair, type Report } from '../oracle/fail-closed.js';
import { assertTradeOnly, type VenueKeyPermissions } from '../venue-vault/permissions.js';
import { parseKek } from '../venue-vault/wrap.js';
import { MemoryVenueVaultStore, VenueVault } from '../venue-vault/vault.js';
import { presentationAddress, STEALTH_SCHEME_ID } from '../stealth/presentation.js';
import { scanAnnouncements, type StealthAnnouncement } from '../stealth/scan.js';
import type { Hex } from 'viem';

export type ProtocolGasPosture = {
  bundler: ReturnType<typeof resolveBundler>;
  /** Default refuse until Nitro configures funding + allowlist. */
  sponsorshipSample: ReturnType<typeof decideSponsorship>;
};

export function protocolGasPosture(input: {
  bundlerUrl: string | undefined;
  bundlerMode?: BundlerMode;
  paymasterFundingConfigured?: boolean;
}): ProtocolGasPosture {
  const bundler = resolveBundler({
    mode: input.bundlerMode ?? (input.bundlerUrl ? 'public_bundler' : 'user_submits'),
    bundlerUrl: input.bundlerUrl ?? null,
    fallbackToUserSubmit: true,
  });

  const policy: SponsorshipPolicy = {
    allowlist: new Set(),
    permittedSelectors: new Set(),
    maxGasPerUserOp: 1_000_000n,
    fundingConfigured: input.paymasterFundingConfigured ?? false,
  };

  return {
    bundler,
    sponsorshipSample: decideSponsorship(policy, {
      sender: '0x0000000000000000000000000000000000000001',
      callSelector: '0x00000000',
      gasLimit: 1n,
    }),
  };
}

/** Off-chain preview of the on-chain FailClosedOracle rule (lending / UI). */
export function previewMark(a: Report | null, b: Report | null, now: number, stalenessBound: number, maxDisagreementBps: number) {
  return markFromPair(a, b, now, stalenessBound, maxDisagreementBps);
}

/**
 * S-L6 boot posture — wrap key empty until Nitro/HSM configures it.
 * Withdrawal-capable material is refused here, not later at trade.
 */
export function venueVaultFromKek(kekHex: string | undefined): VenueVault | null {
  try {
    return new VenueVault(new MemoryVenueVaultStore(), parseKek(kekHex));
  } catch {
    return null;
  }
}

export function previewTradeOnlyRegister(permissions: VenueKeyPermissions): void {
  assertTradeOnly(permissions);
}

export function previewStealthPresentation(spendingKeyId: Hex, ephemeral: Hex) {
  return { schemeId: STEALTH_SCHEME_ID, address: presentationAddress(spendingKeyId, ephemeral) };
}

/** Off-chain ERC-5564 scan. Viewing keys stay with the caller — never env. */
export function previewStealthScan(announcements: readonly StealthAnnouncement[], viewingPrivateKey: Hex, spendingPub: Hex) {
  return scanAnnouncements(announcements, viewingPrivateKey, spendingPub);
}
