/**
 * Launch Agent — pre-listing risk pattern flags (§8.2, §35).
 *
 * Empty deployer history is NO score, not a clean badge. This door refuses
 * `history_absent` rather than laundering absence into assurance.
 *
 * Class X: block-vs-annotate listing policy; live chain reputation port wiring.
 */

import type { CopyKey } from '../copy.js';

export const LAUNCH_REFUSE_COPY = 'agents.error.capability_unavailable' as const satisfies CopyKey;

export type DeployerFacts = {
  readonly lpLocks: number;
  readonly vestings: number;
};

export type DeployerReputationPort = {
  readonly facts: (deployer: string) => DeployerFacts | null | undefined;
};

export type LaunchAssessRefuseReason =
  'deployer_missing' | 'reputation_unread' | 'history_absent' | 'badge_forbidden' | 'block_decision_forbidden';

export type LaunchAssessRefuse = {
  readonly status: 'refuse';
  readonly reason: LaunchAssessRefuseReason;
  readonly kind: 'not_a_badge';
  readonly isBadge: false;
  readonly isBlockDecision: false;
  readonly inventedCleanBadge: false;
  readonly userMessageKey: typeof LAUNCH_REFUSE_COPY;
};

export type LaunchPatternFlag = {
  readonly code: 'no_lp_locks' | 'no_vestings' | 'sparse_lp_locks' | 'sparse_vestings';
  readonly source: 'deployer_reputation';
};

export type LaunchAssessAnnotation = {
  readonly status: 'annotation';
  readonly kind: 'pattern_flags';
  readonly isBadge: false;
  readonly isBlockDecision: false;
  readonly deployer: string;
  readonly lpLocks: number;
  readonly vestings: number;
  readonly patternFlags: readonly LaunchPatternFlag[];
  readonly inventedCleanBadge: false;
  readonly userMessageKey: typeof LAUNCH_REFUSE_COPY;
};

export type LaunchAssessResult = LaunchAssessRefuse | LaunchAssessAnnotation;

export type LaunchAssessInput = {
  readonly deployer?: string;
  readonly asBadge?: boolean;
  readonly asBlockDecision?: boolean;
  readonly reputationPort?: DeployerReputationPort;
};

function refuse(reason: LaunchAssessRefuseReason): LaunchAssessRefuse {
  return {
    status: 'refuse',
    reason,
    kind: 'not_a_badge',
    isBadge: false,
    isBlockDecision: false,
    inventedCleanBadge: false,
    userMessageKey: LAUNCH_REFUSE_COPY,
  };
}

function normalizeDeployer(deployer: string): string {
  return deployer.trim().toLowerCase();
}

export function assessPreListingRisk(input: LaunchAssessInput = {}): LaunchAssessResult {
  if (input.asBadge) return refuse('badge_forbidden');
  if (input.asBlockDecision) return refuse('block_decision_forbidden');

  const deployer = input.deployer?.trim();
  if (!deployer) return refuse('deployer_missing');

  const port = input.reputationPort;
  if (!port) return refuse('reputation_unread');

  const raw = port.facts(normalizeDeployer(deployer));
  if (raw == null) return refuse('reputation_unread');

  const lpLocks = raw.lpLocks;
  const vestings = raw.vestings;
  if (lpLocks === 0 && vestings === 0) return refuse('history_absent');

  const patternFlags: LaunchPatternFlag[] = [];
  if (lpLocks === 0) patternFlags.push({ code: 'no_lp_locks', source: 'deployer_reputation' });
  if (vestings === 0) patternFlags.push({ code: 'no_vestings', source: 'deployer_reputation' });
  if (lpLocks > 0 && lpLocks < 2) patternFlags.push({ code: 'sparse_lp_locks', source: 'deployer_reputation' });
  if (vestings > 0 && vestings < 2) patternFlags.push({ code: 'sparse_vestings', source: 'deployer_reputation' });

  return {
    status: 'annotation',
    kind: 'pattern_flags',
    isBadge: false,
    isBlockDecision: false,
    deployer: normalizeDeployer(deployer),
    lpLocks,
    vestings,
    patternFlags,
    inventedCleanBadge: false,
    userMessageKey: LAUNCH_REFUSE_COPY,
  };
}
