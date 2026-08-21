/**
 * Class X live-plane env wiring — honest `/ready` inventory for svc-agents.
 *
 * Configured fleet URLs open HTTP/S2S doors. Upstream stores may still refuse
 * (`no_live_metrics`, `no_live_leaders`, …) — never reported as live data here.
 */

export type AgentsLivePlanesSummary = {
  readonly tradeUrlConfigured: boolean;
  readonly payUrlConfigured: boolean;
  readonly supportUrlConfigured: boolean;
  readonly identityUrlConfigured: boolean;
  /** Fleet URL pin ≠ upstream store wired. Always true in Stage-1. */
  readonly storesMayStillRefuse: true;
};

export function describeAgentsLivePlanes(env: NodeJS.ProcessEnv = process.env): AgentsLivePlanesSummary {
  return {
    tradeUrlConfigured: (env.TRADE_URL?.trim() ?? '').length > 0,
    payUrlConfigured: (env.PAY_URL?.trim() ?? '').length > 0,
    supportUrlConfigured: (env.SUPPORT_URL?.trim() ?? '').length > 0,
    identityUrlConfigured: (env.IDENTITY_URL?.trim() ?? '').length > 0,
    storesMayStillRefuse: true,
  };
}
