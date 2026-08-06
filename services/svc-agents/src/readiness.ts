import { isUsable, supports, type ModelProvider } from './providers/provider.js';
import type { RoutingTable } from './gateway/routing.js';

/**
 * HONEST READINESS FOR svc-agents (Board Clear A-P5-AGENTS).
 *
 * `/ready` used to answer `{ ready: true, meteringEnabled, tasks }`. That tells
 * an operator the process is up and which tasks are configured — and nothing
 * about whether a completion can actually leave this process.
 *
 * Two facts are easy to get wrong and expensive to discover late:
 *
 *   1. The default engine is the **mock**. A green container with `mode: mock`
 *      is not "AI fleet live"; it is a deterministic stand-in that never talks
 *      to an upstream. Naming the mode on `/ready` is what stops a dashboard
 *      from reading "ready" as "users get real inference".
 *   2. A route can name a provider id that is not registered, or a provider
 *      that is unhealthy. The gateway refuses those at call time; readiness
 *      says the same thing out loud so the refusal is not the first signal.
 *
 * Process readiness stays true once boot succeeded (schema + listen). Degraded
 * engine is reported as `usefulPath.available: false`, not as 503 — sessions,
 * logs and settlement still work without a healthy engine, and taking the
 * whole service out of the fleet over an engine outage would hide the audit
 * trail an operator needs to inspect the outage with.
 */

export type ProviderMode = 'mock' | 'upstream';

export interface AgentsReadinessInput {
  readonly providerMode: ProviderMode;
  readonly providers: readonly ModelProvider[];
  readonly table: RoutingTable;
  readonly meteringEnabled: boolean;
  readonly now?: Date;
}

export interface ProviderReadiness {
  readonly id: string;
  readonly usable: boolean;
  readonly healthy: boolean;
  /** Operator-facing only. Never a vendor name (Doctrine §0.7). */
  readonly reason: string | null;
  readonly capabilities: readonly string[];
}

export interface UsefulPathStatus {
  /**
   * True when at least one completion route can be served right now — a
   * registered, usable provider that declares `complete`.
   *
   * This is the thin useful path for the gateway itself. Product agents
   * (Navigator, Support, …) are separate work that register guardrails; they
   * are not claimed here.
   */
  readonly available: boolean;
  /** First completion task that is currently servable, or null. */
  readonly task: string | null;
  /** Why available is false, or what the path still is not (honest residual). */
  readonly residual: string | null;
}

export interface AgentsReadiness {
  readonly ready: true;
  readonly providerMode: ProviderMode;
  readonly providers: readonly ProviderReadiness[];
  readonly meteringEnabled: boolean;
  readonly tasks: readonly string[];
  readonly usefulPath: UsefulPathStatus;
}

export function agentsReadiness(input: AgentsReadinessInput): AgentsReadiness {
  const now = input.now ?? new Date();
  const byId = new Map(input.providers.map((p) => [p.id, p]));

  const providers: ProviderReadiness[] = input.providers.map((p) => {
    const health = p.health();
    const usable = isUsable(p, now);
    return {
      id: p.id,
      usable,
      healthy: health.healthy,
      reason: health.reason ?? null,
      capabilities: [...p.capabilities],
    };
  });

  const tasks = input.table.routes.map((r) => r.task);

  let usefulTask: string | null = null;
  let residual: string | null = null;

  for (const route of input.table.routes) {
    if (route.capability !== 'complete') continue;
    const provider = byId.get(route.providerId);
    if (!provider) {
      residual ??= `route "${route.task}" names provider "${route.providerId}", which is not registered`;
      continue;
    }
    if (!supports(provider, 'complete')) {
      residual ??= `provider "${provider.id}" does not declare complete for task "${route.task}"`;
      continue;
    }
    if (!isUsable(provider, now)) {
      residual ??= `provider "${provider.id}" is not usable: ${provider.health().reason ?? 'unhealthy or stale'}`;
      continue;
    }
    usefulTask = route.task;
    break;
  }

  if (usefulTask === null && residual === null) {
    residual = input.table.routes.length === 0 ? 'no routes configured' : 'no completion route is currently servable';
  }

  // Mock mode always carries an honesty residual even when the path works: the
  // engine answers, but it is not production inference. Upstream mode drops
  // that residual once a real completion is servable.
  if (usefulTask !== null) {
    residual =
      input.providerMode === 'mock'
        ? 'engine is the deterministic mock — not production inference; product agents are not registered by this service'
        : null;
  }

  return {
    ready: true,
    providerMode: input.providerMode,
    providers,
    meteringEnabled: input.meteringEnabled,
    tasks,
    usefulPath: {
      available: usefulTask !== null,
      task: usefulTask,
      residual,
    },
  };
}

/** L3 — usable provider count (no invent). */
export function usableProviderCount(readiness: AgentsReadiness): number {
  return readiness.providers.filter((p) => p.usable).length;
}

/** L3 — registered provider count. */
export function providerCount(readiness: AgentsReadiness): number {
  return readiness.providers.length;
}

/** L3 — task route count. */
export function readinessTaskCount(readiness: AgentsReadiness): number {
  return readiness.tasks.length;
}

/** L3 — readiness board card. */
export function agentsReadinessBoardCard(readiness: AgentsReadiness): {
  readonly ready: boolean;
  readonly mode: ProviderMode;
  readonly providers: number;
  readonly usable: number;
  readonly tasks: number;
  readonly usefulAvailable: boolean;
  readonly metering: boolean;
} {
  return {
    ready: readiness.ready,
    mode: readiness.providerMode,
    providers: providerCount(readiness),
    usable: usableProviderCount(readiness),
    tasks: readinessTaskCount(readiness),
    usefulAvailable: readiness.usefulPath.available,
    metering: readiness.meteringEnabled,
  };
}

/** L3 — status line. */
export function agentsReadinessStatusLine(readiness: AgentsReadiness): string {
  const c = agentsReadinessBoardCard(readiness);
  return `ready=${c.ready ? '1' : '0'} mode=${c.mode} providers=${c.providers} usable=${c.usable} tasks=${c.tasks} useful=${c.usefulAvailable ? '1' : '0'}`;
}

/** L3 — parse status. Invalid → null. */
export function parseAgentsReadinessStatusLine(line: string): {
  readonly ready: boolean;
  readonly mode: ProviderMode;
  readonly providers: number;
  readonly usable: number;
  readonly tasks: number;
  readonly useful: boolean;
} | null {
  const m = line.trim().match(/^ready=([01]) mode=(mock|upstream) providers=(\d+) usable=(\d+) tasks=(\d+) useful=([01])$/);
  if (!m) return null;
  return {
    ready: m[1] === '1',
    mode: m[2] as ProviderMode,
    providers: Number(m[3]),
    usable: Number(m[4]),
    tasks: Number(m[5]),
    useful: m[6] === '1',
  };
}

/** L3 — true when status matches. */
export function agentsReadinessStatusLineMatches(readiness: AgentsReadiness): boolean {
  const p = parseAgentsReadinessStatusLine(agentsReadinessStatusLine(readiness));
  if (!p) return false;
  const c = agentsReadinessBoardCard(readiness);
  return (
    p.ready === c.ready &&
    p.mode === c.mode &&
    p.providers === c.providers &&
    p.usable === c.usable &&
    p.tasks === c.tasks &&
    p.useful === c.usefulAvailable
  );
}

/** L3 — export header. */
export function agentsReadinessExportHeader(): string {
  return 'ready,mode,providers,usable,tasks,useful,metering';
}

/** L3 — export line. */
export function agentsReadinessExportLine(readiness: AgentsReadiness): string {
  const c = agentsReadinessBoardCard(readiness);
  return `${c.ready ? '1' : '0'},${c.mode},${c.providers},${c.usable},${c.tasks},${c.usefulAvailable ? '1' : '0'},${c.metering ? '1' : '0'}`;
}

/** L3 — full export. */
export function agentsReadinessExportText(readiness: AgentsReadiness): string {
  return [agentsReadinessExportHeader(), agentsReadinessExportLine(readiness)].join('\n');
}

/** L3 — true when usable count is within [min,max]. Invalid → false. */
export function usableProviderCountInRange(readiness: AgentsReadiness, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = usableProviderCount(readiness);
  return n >= min && n <= max;
}

/** L3 — true when mock residual honesty applies. */
export function isMockEngineResidual(readiness: AgentsReadiness): boolean {
  return readiness.providerMode === 'mock' && readiness.usefulPath.available;
}
