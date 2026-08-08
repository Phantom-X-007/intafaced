/**
 * Bundler policy decision (S-A11) — stated choice + failure mode.
 * Live EntryPoint differential remains `socket.userop-differential-test`.
 */
export type BundlerMode = 'user_submits' | 'public_bundler' | 'self_hosted';

export type BundlerPolicy = {
  mode: BundlerMode;
  /** Required when mode uses a relay URL. */
  bundlerUrl: string | null;
  /** When public/self-hosted is down, fall back to user-submitted UserOp. */
  fallbackToUserSubmit: true;
};

export function resolveBundler(policy: BundlerPolicy): {
  submitVia: 'user' | 'bundler';
  url: string | null;
  failureMode: string;
} {
  if (policy.mode === 'user_submits') {
    return {
      submitVia: 'user',
      url: null,
      failureMode: 'User must hold native gas or use a paymaster; no third-party reorder risk.',
    };
  }
  if (!policy.bundlerUrl) {
    return {
      submitVia: 'user',
      url: null,
      failureMode:
        policy.mode === 'public_bundler'
          ? 'Public bundler URL unset — falling back to user submit (fallbackToUserSubmit).'
          : 'Self-hosted bundler URL unset — falling back to user submit.',
    };
  }
  return {
    submitVia: 'bundler',
    url: policy.bundlerUrl,
    failureMode:
      policy.mode === 'public_bundler'
        ? 'Public bundler may censor or reorder UserOps; on failure fall back to user submit.'
        : 'Self-hosted outage blocks relay; on failure fall back to user submit.',
  };
}
