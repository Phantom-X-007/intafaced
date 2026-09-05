import { readyRoutes } from './routes.js';

/**
 * GET `/ready` never probes upstream `/health`.
 *
 * `upstreamWiring.wired` sold a nonempty env URL as a live hop next to
 * `ready: true`. A URL is config. This process does not fetch.
 */
export const EDGE_UPSTREAM_UNPROBED = 'edge.upstream_unprobed' as const;

export type ReadyUpstreamHonesty = {
  readonly configured: readonly string[];
  readonly absent: readonly string[];
  readonly probe: 'unprobed';
  readonly code: typeof EDGE_UPSTREAM_UNPROBED;
};

export function readyUpstreamHonesty(envLookup: (name: string) => string | undefined): ReadyUpstreamHonesty {
  const table = readyRoutes(envLookup);
  return {
    configured: table.filter((r) => r.configured).map((r) => r.prefix),
    absent: table.filter((r) => !r.configured).map((r) => r.prefix),
    probe: 'unprobed',
    code: EDGE_UPSTREAM_UNPROBED,
  };
}
