/**
 * Live wiring for S-A10 / S-A11 / S-A12 policy modules — keeps them reachable
 * from boot (reachability gate) rather than test-only islands.
 */
import { resolveBundler, type BundlerMode } from './bundler-policy.js';
import { decideSponsorship, type SponsorshipPolicy } from './paymaster-policy.js';
import { markFromPair, type Report } from '../oracle/fail-closed.js';

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
