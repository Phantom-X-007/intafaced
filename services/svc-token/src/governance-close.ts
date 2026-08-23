/**
 * §4.3 governance tally — quorum / threshold from owner env, never invented.
 *
 * `TOKEN_GOVERNANCE_QUORUM_BPS` and `TOKEN_GOVERNANCE_THRESHOLD_BPS` have no
 * default. Blank / missing / non-integer → `token.governance_quorum_unset`.
 * Explicit `0` is owner-present (always-met quorum or 0% pass bar), not a skip.
 *
 * Close writes `passed` | `rejected` only. Grant / listing execution is
 * `token.governance_execute_unwired` — this module does not move value.
 */
export const GOVERNANCE_QUORUM_BPS_ENV = 'TOKEN_GOVERNANCE_QUORUM_BPS';
export const GOVERNANCE_THRESHOLD_BPS_ENV = 'TOKEN_GOVERNANCE_THRESHOLD_BPS';

export const GOVERNANCE_QUORUM_UNSET = 'token.governance_quorum_unset' as const;
export const GOVERNANCE_EXECUTE_UNWIRED = 'token.governance_execute_unwired' as const;

export type GovernanceBps = { readonly present: false } | { readonly present: true; readonly bps: number };

export type ProposalKind = 'listing' | 'fee_param' | 'curriculum' | 'grant';

/**
 * Read one owner bps field. Missing / blank / garbage is unset — never coerced
 * to 0 (0-as-free would be invented). Range is 0..=10000 inclusive.
 */
export function readGovernanceBps(raw: string | undefined): GovernanceBps {
  if (raw === undefined) return { present: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { present: false };
  if (!/^[0-9]+$/.test(trimmed)) return { present: false };
  const bps = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) return { present: false };
  return { present: true, bps };
}

export function readGovernanceParams(env: { readonly [key: string]: string | undefined }): {
  readonly quorumBps: number | undefined;
  readonly thresholdBps: number | undefined;
} {
  const quorum = readGovernanceBps(env[GOVERNANCE_QUORUM_BPS_ENV]);
  const threshold = readGovernanceBps(env[GOVERNANCE_THRESHOLD_BPS_ENV]);
  return {
    quorumBps: quorum.present ? quorum.bps : undefined,
    thresholdBps: threshold.present ? threshold.bps : undefined,
  };
}

export function decideProposalOutcome(input: {
  readonly forWeight: bigint;
  readonly againstWeight: bigint;
  readonly abstainWeight: bigint;
  readonly eligibleStake: bigint;
  readonly quorumBps: number;
  readonly thresholdBps: number;
}): 'passed' | 'rejected' {
  const total = input.forWeight + input.againstWeight + input.abstainWeight;
  const quorumMet = total * 10_000n >= input.eligibleStake * BigInt(input.quorumBps);
  const decided = input.forWeight + input.againstWeight;
  const passMet = decided > 0n && input.forWeight * 10_000n >= decided * BigInt(input.thresholdBps);
  return quorumMet && passMet ? 'passed' : 'rejected';
}

/** Grant and listing do not execute on close. Other kinds are status-only too. */
export function executeUnwiredFor(kind: ProposalKind): typeof GOVERNANCE_EXECUTE_UNWIRED | null {
  return kind === 'grant' || kind === 'listing' ? GOVERNANCE_EXECUTE_UNWIRED : null;
}
