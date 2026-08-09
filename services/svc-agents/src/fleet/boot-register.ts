/**
 * Product-agent boot registration.
 *
 * README residual: `openSession` binds a guardrail from `agent_definitions`.
 * Factories + runSession mounts existed without writing those rows at process
 * start, so a real deploy's first metered run 404'd as `agents.agent_not_found`.
 *
 * Registration is a deployment act (upsert guardrail once per boot), not a
 * per-request side-effect inside `runSession` — a run must not widen its own
 * powers on the way in.
 */

import { PRODUCT_AGENT_IDS, serialiseGuardrail, type Guardrail } from './guardrails.js';
import { FLEET_PRODUCT_AGENTS, type FleetAgentRow } from './matrix.js';

/** Minimal runtime surface boot needs — avoids importing the full AgentRuntime cycle. */
export type BootRegisterRuntime = {
  registerAgent(input: unknown, options?: { enabled?: boolean }): Promise<Guardrail>;
};

export type BootRegisterResult = {
  /** Agent ids written (or upserted) this boot, stable matrix order. */
  readonly registered: readonly string[];
  readonly count: number;
};

/**
 * Register every Stage-1 product factory into `agent_definitions`.
 *
 * Idempotent: `registerAgent` upserts on `agent_id`. Re-boot re-asserts the
 * current factory snapshot so a widened toolset is not stuck on an old row.
 *
 * First insert enables the agent. Re-boot must **not** re-enable an operator
 * kill — `registerAgent` preserves `enabled` on conflict (see runtime).
 * `{ enabled: true }` here only seeds the insert path.
 */
export async function registerProductAgentsAtBoot(
  runtime: BootRegisterRuntime,
  rows: readonly FleetAgentRow[] = FLEET_PRODUCT_AGENTS,
): Promise<BootRegisterResult> {
  const registered: string[] = [];
  for (const row of rows) {
    const guardrail = row.factory();
    if (guardrail.agentId !== row.agentId) {
      throw new Error(`Fleet matrix row agentId "${row.agentId}" does not match factory guardrail "${guardrail.agentId}"`);
    }
    // Factories return parsed Guardrail (bigint spend). registerAgent re-parses
    // wire/json shape — serialise first so maxSpend is a decimal string.
    const written = await runtime.registerAgent(serialiseGuardrail(guardrail), { enabled: true });
    registered.push(written.agentId);
  }
  return { registered, count: registered.length };
}

/** Pure: the agent ids boot will attempt, for readiness / matrix honesty. */
export function bootRegisterAgentIds(rows: readonly FleetAgentRow[] = FLEET_PRODUCT_AGENTS): readonly string[] {
  return rows.map((r) => r.agentId);
}

/** Pure: boot claims every product agent id in the sealed PRODUCT_AGENT_IDS set. */
export function bootRegisterCoversProductIds(rows: readonly FleetAgentRow[] = FLEET_PRODUCT_AGENTS): boolean {
  const claimed = new Set(rows.map((r) => r.agentId));
  return (PRODUCT_AGENT_IDS as readonly string[]).every((id) => claimed.has(id)) && claimed.size === PRODUCT_AGENT_IDS.length;
}
