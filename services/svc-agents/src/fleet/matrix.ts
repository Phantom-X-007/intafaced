/**
 * Fleet mount matrix — the honest inventory of product agents.
 *
 * Stage-1 factories + routing tasks + whether a metered `runSession` is
 * mounted on the tRPC router + whether boot writes the guardrail into
 * `agent_definitions`. This matrix is the checkable contract so a factory
 * cannot land without a routing task (or the reverse) without a red test.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROUTING_TABLE } from '../gateway/routing.js';
import { navigatorAgentGuardrail } from '../navigator/guardrail.js';
import { supportAgentGuardrail } from '../support-agent/guardrail.js';
import { scannerAgentGuardrail } from '../scanner/guardrail.js';
import { merchantAgentGuardrail } from '../merchant/guardrail.js';
import { copyIntelAgentGuardrail } from '../copy-intel/guardrail.js';
import type { Guardrail } from './guardrails.js';

export type FleetAgentRow = {
  readonly agentId: string;
  readonly factory: () => Guardrail;
  /**
   * Whether `router.ts` mounts a product `*.runSession` for this agent.
   * Pure fixtures/query paths alone do not count.
   */
  readonly runSessionMounted: boolean;
  /** Whether process boot upserts this guardrail into agent_definitions. */
  readonly bootRegistered: boolean;
};

/**
 * The five Stage-1 product agents that own a guardrail factory in this service.
 *
 * Portfolio / launch / risk / coach / growth are doctrine names only — no
 * factory here, deliberately absent from this matrix until product law lands.
 */
export const FLEET_PRODUCT_AGENTS: readonly FleetAgentRow[] = [
  {
    agentId: 'navigator',
    factory: () => navigatorAgentGuardrail(),
    runSessionMounted: true,
    bootRegistered: true,
  },
  {
    agentId: 'support',
    factory: () => supportAgentGuardrail(),
    runSessionMounted: true,
    bootRegistered: true,
  },
  {
    agentId: 'scanner',
    factory: () => scannerAgentGuardrail(),
    runSessionMounted: true,
    bootRegistered: true,
  },
  {
    agentId: 'merchant',
    factory: () => merchantAgentGuardrail(),
    // Metered merchant.runSession on tip (#1284).
    runSessionMounted: true,
    bootRegistered: true,
  },
  {
    agentId: 'copy-intel',
    factory: () => copyIntelAgentGuardrail(),
    // Metered copyIntel.runSession (this PR).
    runSessionMounted: true,
    bootRegistered: true,
  },
] as const;

/** Routing task ids declared by every product agent guardrail. */
export function fleetAllowedTasks(): readonly string[] {
  const tasks = new Set<string>();
  for (const row of FLEET_PRODUCT_AGENTS) {
    for (const t of row.factory().limits.allowedTasks) tasks.add(t);
  }
  return [...tasks].sort();
}

/** Default routing table task ids. */
export function defaultRoutingTasks(): readonly string[] {
  return DEFAULT_ROUTING_TABLE.routes.map((r) => r.task).sort();
}

/**
 * Every product-agent allowed task must appear in the default routing table,
 * or a completion for that task fails before it starts.
 */
export function tasksMissingFromRouting(): readonly string[] {
  const routes = new Set(defaultRoutingTasks());
  return fleetAllowedTasks().filter((t) => !routes.has(t));
}

/**
 * Routing tasks that look product-agent-shaped (prefix) but no factory claims them.
 * `index.embed` is gateway infra, not a product agent — excluded.
 */
export function routingTasksWithoutFactory(): readonly string[] {
  const claimed = new Set(fleetAllowedTasks());
  const productPrefixes = ['navigator.', 'support.', 'scanner.', 'merchant.', 'copy_intel.'];
  return defaultRoutingTasks().filter((t) => productPrefixes.some((p) => t.startsWith(p)) && !claimed.has(t));
}

/** Parse router.ts for `namespace: { ... runSession` product mounts. */
export function runSessionMountsInRouterSource(): readonly string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  // Top-level agent namespaces that declare runSession.
  const mounts: string[] = [];
  const re = /^\s{4}(scanner|navigator|support|merchant|copyIntel):\s*router\(\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const ns = m[1]!;
    // Look ahead in that namespace block for runSession (until next same-indent key or end)
    const from = m.index;
    const next = src.slice(from + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
    const block = next === -1 ? src.slice(from) : src.slice(from, from + 1 + next);
    if (/\brunSession\s*:/.test(block)) mounts.push(ns);
  }
  return mounts.sort();
}

/** Map matrix agentId → expected router namespace. */
export function expectedRunSessionNamespaces(): readonly string[] {
  return FLEET_PRODUCT_AGENTS.filter((a) => a.runSessionMounted)
    .map((a) => (a.agentId === 'copy-intel' ? 'copyIntel' : a.agentId === 'support' ? 'support' : a.agentId))
    .sort();
}

/** Board card for ops / readiness residual. */
export function fleetMatrixBoardCard(): {
  readonly agents: number;
  readonly withRunSession: number;
  readonly bootRegistered: number;
  readonly tasksMissingRoute: number;
} {
  return {
    agents: FLEET_PRODUCT_AGENTS.length,
    withRunSession: FLEET_PRODUCT_AGENTS.filter((a) => a.runSessionMounted).length,
    bootRegistered: FLEET_PRODUCT_AGENTS.filter((a) => a.bootRegistered).length,
    tasksMissingRoute: tasksMissingFromRouting().length,
  };
}
