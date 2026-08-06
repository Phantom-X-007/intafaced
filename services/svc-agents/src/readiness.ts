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
