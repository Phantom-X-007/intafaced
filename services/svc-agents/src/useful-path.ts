import type { ModelGateway } from './gateway/gateway.js';
import type { TokenUsage } from './providers/provider.js';

/**
 * THE THIN USEFUL PATH ON THE EXISTING GATEWAY (Board Clear A-P5-AGENTS).
 *
 * Product agents (Navigator, Support, Market Scanner, …) are separate work
 * that register guardrails and drive `openSession → think → act → settle`.
 * This module is not that.
 *
 * It is the smallest path that proves the gateway can answer: pick a
 * completion task from the routing table, call `complete`, return text + usage.
 * No session, no ledger, no audit trail — those compose on top in `runtime.ts`.
 *
 * Why this exists as a named function rather than only as a test:
 *   · readiness can point at the same task the probe uses
 *   · a future operator deep-probe (or internal batch job) can call it without
 *     inheriting a billing path — which is why the gateway was kept ignorant
 *     of sessions and meters in the first place
 *
 * Default task is the first `complete` route on the table. Callers that care
 * about a specific task pass it.
 */

export interface UsefulPathResult {
  readonly task: string;
  readonly text: string;
  readonly usage: TokenUsage;
  readonly model: string;
  readonly providerId: string;
}

const PROBE_MESSAGE = 'agents.useful_path.probe';

export function firstCompletionTask(gateway: ModelGateway): string | null {
  for (const route of gateway.routingTable.routes) {
    if (route.capability === 'complete') return route.task;
  }
  return null;
}

/**
 * One completion through the gateway.
 *
 * Throws the same typed errors the gateway already throws (unrouted task,
 * unregistered provider, unhealthy engine). Callers that want a soft probe
 * catch those; this function does not invent a softer shape.
 */
export async function runUsefulPath(
  gateway: ModelGateway,
  options: { task?: string; signal?: AbortSignal } = {},
): Promise<UsefulPathResult> {
  const task = options.task ?? firstCompletionTask(gateway);
  if (!task) {
    throw new Error('no completion route is configured — useful path cannot run');
  }

  const { route, result } = await gateway.complete(task, {
    messages: [{ role: 'user', content: PROBE_MESSAGE }],
    ...(options.signal ? { signal: options.signal } : {}),
  });

  return {
    task: route.task,
    text: result.text,
    usage: result.usage,
    model: route.model,
    providerId: result.providerId,
  };
}
