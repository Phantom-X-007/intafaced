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

/** L3 — probe message constant (for operator honesty boards). */
export function usefulPathProbeMessage(): string {
  return PROBE_MESSAGE;
}

/** L3 — true when a completion task exists. */
export function hasUsefulPathTask(gateway: ModelGateway): boolean {
  return firstCompletionTask(gateway) !== null;
}

/** L3 — board card from a useful-path result (no invent usage). */
export function usefulPathResultBoardCard(result: UsefulPathResult): {
  readonly task: string;
  readonly model: string;
  readonly providerId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly textLen: number;
} {
  return {
    task: result.task,
    model: result.model,
    providerId: result.providerId,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    textLen: result.text.length,
  };
}

/** L3 — status line from result. */
export function usefulPathResultStatusLine(result: UsefulPathResult): string {
  const c = usefulPathResultBoardCard(result);
  return `task=${c.task} model=${c.model} provider=${c.providerId} in=${c.inputTokens} out=${c.outputTokens}`;
}

/** L3 — parse status. Invalid → null. */
export function parseUsefulPathResultStatusLine(
  line: string,
): { readonly task: string; readonly model: string; readonly provider: string; readonly in: number; readonly out: number } | null {
  const m = line.trim().match(/^task=(\S+) model=(\S+) provider=(\S+) in=(\d+) out=(\d+)$/);
  if (!m) return null;
  return { task: m[1]!, model: m[2]!, provider: m[3]!, in: Number(m[4]), out: Number(m[5]) };
}

/** L3 — true when status matches result. */
export function usefulPathResultStatusLineMatches(result: UsefulPathResult): boolean {
  const p = parseUsefulPathResultStatusLine(usefulPathResultStatusLine(result));
  if (!p) return false;
  const c = usefulPathResultBoardCard(result);
  return p.task === c.task && p.model === c.model && p.provider === c.providerId && p.in === c.inputTokens && p.out === c.outputTokens;
}

/** L3 — export header. */
export function usefulPathResultExportHeader(): string {
  return 'task,model,providerId,inputTokens,outputTokens,textLen';
}

/** L3 — export line. */
export function usefulPathResultExportLine(result: UsefulPathResult): string {
  const c = usefulPathResultBoardCard(result);
  return `${c.task},${c.model},${c.providerId},${c.inputTokens},${c.outputTokens},${c.textLen}`;
}

/** L3 — full export. */
export function usefulPathResultExportText(result: UsefulPathResult): string {
  return [usefulPathResultExportHeader(), usefulPathResultExportLine(result)].join('\n');
}

/** L3 — true when textLen is within [min,max]. Invalid → false. */
export function usefulPathTextLenInRange(result: UsefulPathResult, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = result.text.length;
  return n >= min && n <= max;
}

/** L3 — true when mock-shaped text (honest mock prefix). */
export function isMockUsefulPathText(result: UsefulPathResult): boolean {
  return result.text.startsWith('mock:');
}
