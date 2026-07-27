import type { CopyKey } from './copy.js';

/**
 * Errors carry two things: a machine code the platform branches on, and a copy
 * key the surface renders.
 *
 * The `message` is for operators — it goes to logs and spans. It is never what
 * a user reads, which is why `userMessageKey` is mandatory rather than
 * optional: an error without one has no defined user-facing form, and a code
 * path that has to invent one at the surface is exactly how a vendor's error
 * text ends up on a screen (Doctrine §0.7).
 */
export type AgentErrorCode =
  | 'agents.route_not_found'
  | 'agents.capability_unavailable'
  | 'agents.provider_unavailable'
  | 'agents.provider_failed'
  | 'agents.session_not_found'
  | 'agents.session_closed'
  | 'agents.agent_not_found'
  | 'agents.window_sealed'
  | 'agents.window_not_found'
  | 'agents.invalid_usage'
  | 'agents.refused';

export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: AgentErrorCode,
    readonly userMessageKey: CopyKey,
    readonly userMessageParams: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/**
 * Thrown by an adapter when the upstream engine did not answer.
 *
 * Distinct from `AgentError` because the caller must be able to tell "the
 * engine failed" from "the platform refused": the first is retryable and bills
 * nothing, the second is a decision and is recorded as one.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    /** True when a retry could plausibly succeed (timeout, 429, 5xx). */
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
