/**
 * venue.aggregation live-network CI wiring — workflow + smoke test presence.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const VENUE_AGGREGATION_LIVE_NETWORK_WORKFLOW = '.github/workflows/venue-aggregation-live-network.yml' as const;

export const VENUE_AGGREGATION_LIVE_NETWORK_SMOKE_TEST = 'packages/venue-adapter/src/fabric/venues/live-network-smoke.test.ts' as const;

export function venueAggregationLiveNetworkWorkflowPresent(): boolean {
  return existsSync(join(ROOT, VENUE_AGGREGATION_LIVE_NETWORK_WORKFLOW));
}

export function venueAggregationLiveNetworkSmokeTestPresent(): boolean {
  return existsSync(join(ROOT, VENUE_AGGREGATION_LIVE_NETWORK_SMOKE_TEST));
}

export function venueAggregationLiveNetworkCiWired(): boolean {
  if (!venueAggregationLiveNetworkWorkflowPresent() || !venueAggregationLiveNetworkSmokeTestPresent()) {
    return false;
  }
  const workflow = readFileSync(join(ROOT, VENUE_AGGREGATION_LIVE_NETWORK_WORKFLOW), 'utf8');
  const smoke = readFileSync(join(ROOT, VENUE_AGGREGATION_LIVE_NETWORK_SMOKE_TEST), 'utf8');
  return (
    /VENUE_AGGREGATION_LIVE_NETWORK_CI:\s*['"]1['"]/.test(workflow) &&
    /live-network-smoke\.test\.ts/.test(workflow) &&
    /VENUE_AGGREGATION_LIVE_NETWORK_CI/.test(smoke) &&
    /PUBLIC_MARKET_DATA_VENUE_IDS/.test(smoke)
  );
}
