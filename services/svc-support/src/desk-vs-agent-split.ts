/**
 * D26-P1-O3 — ops.support desk mountain vs agents.support assist surface.
 *
 * The desk (this service) is the ticket/KB/operator queue product. The
 * agents.support fleet member is an assist layer that must never claim to *be*
 * the desk, invent balances, or replace human queue ownership.
 *
 * Exported constants keep `/ready` and tests honest about the split.
 */

export const OPS_SUPPORT_MOUNTAIN = 'ops.support' as const;
export const AGENTS_SUPPORT_ASSIST = 'agents.support' as const;

export const DESK_STAGE = '4-audited-grounded-desk' as const;

/** What the desk owns — not the metered agent. */
export const DESK_OWNS = [
  'tickets',
  'kb',
  'operator_queue',
  'ticket_events_audit',
  'account_state_read_via_identity',
  'escalation_case_file',
] as const;

/** Explicit non-goals for the desk mountain (agent / other planes). */
export const DESK_DOES_NOT = [
  'metered_agent_sessions',
  'invent_ledger_balances',
  'replace_human_queue_ownership',
  'agents.support_product_complete',
] as const;

export type DeskVsAgentSplit = {
  readonly deskMountain: typeof OPS_SUPPORT_MOUNTAIN;
  readonly agentAssist: typeof AGENTS_SUPPORT_ASSIST;
  readonly stage: typeof DESK_STAGE;
  readonly deskOwns: readonly string[];
  readonly deskDoesNot: readonly string[];
  readonly accountStateSource: 'svc-identity';
  /** True: human desk works without the agent (agents.support soft dep inverted). */
  readonly deskStandalone: true;
};

export function deskVsAgentSplit(): DeskVsAgentSplit {
  return {
    deskMountain: OPS_SUPPORT_MOUNTAIN,
    agentAssist: AGENTS_SUPPORT_ASSIST,
    stage: DESK_STAGE,
    deskOwns: DESK_OWNS,
    deskDoesNot: DESK_DOES_NOT,
    accountStateSource: 'svc-identity',
    deskStandalone: true,
  };
}
