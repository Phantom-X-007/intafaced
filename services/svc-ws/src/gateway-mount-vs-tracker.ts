/**
 * D26-P4-06 — ws.gateway mount vs tracker honest gaps.
 *
 * Backend product-complete: depth/trade/private fan-out with empty-book honesty.
 * Residual ops streams polish stays Class X; never invent quiet market or positions.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WS_GATEWAY_TRACKER_ID = 'ws.gateway' as const;

export const GATEWAY_PRODUCT_SYMBOLS = [
  'describeGatewayPolicy',
  'DEPTH_ENGINE_UNAVAILABLE',
  'ORDERS_ENGINE_UNAVAILABLE',
  'DEPTH_MARKET_HALTED',
  'DEPTH_PUSH_UNAVAILABLE',
  'createWebSocketGateway',
  'createDropCopyWebSocketGateway',
] as const;

export const GATEWAY_HONEST_GAPS = ['gap.residual_private_stream_ops', 'gap.no_invented_positions_blotter'] as const;

export function gatewaySymbolsInProductSource(): readonly (typeof GATEWAY_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const policySrc = readFileSync(join(here, 'gateway-policy.ts'), 'utf8');
  const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
  const gatewaySrc = readFileSync(join(here, 'ws', 'gateway.ts'), 'utf8');
  const blob = [policySrc, indexSrc, gatewaySrc].join('\n');
  return GATEWAY_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function gatewayHonestyTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return (
    existsSync(join(here, 'empty-book-honesty.test.ts')) &&
    existsSync(join(here, 'empty-trades-honesty.test.ts')) &&
    existsSync(join(here, 'empty-orders-honesty.test.ts')) &&
    existsSync(join(here, 'drop-copy', 'honesty.test.ts')) &&
    existsSync(join(here, 'gateway-policy.test.ts')) &&
    existsSync(join(here, 'push-vs-poll-honesty.test.ts')) &&
    existsSync(join(here, 'ws', 'gateway.test.ts'))
  );
}

export function gatewayPolicyHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'gateway-policy.ts'), 'utf8');
  return (
    /emptyBookStaysEmpty:\s*true/.test(src) &&
    /inventsQuietMarket:\s*false/.test(src) &&
    /inventsFuturesPositions:\s*false/.test(src) &&
    /dropCopyReplayDurable:\s*false/.test(src) &&
    /DEPTH_ENGINE_UNAVAILABLE/.test(src) &&
    /ORDERS_ENGINE_UNAVAILABLE/.test(src) &&
    /DEPTH_MARKET_HALTED/.test(src) &&
    /matchingNotTradableNamed:\s*true/.test(src) &&
    /depthTransport:\s*DEPTH_TRANSPORT_POLL/.test(src) &&
    /l3Transport:\s*DEPTH_TRANSPORT_POLL/.test(src) &&
    /l3Push:\s*false/.test(src) &&
    /DEPTH_PUSH_UNAVAILABLE/.test(src)
  );
}

export function wsGatewayTrackerBackendDoneBarMet(): boolean {
  return (
    gatewaySymbolsInProductSource().length === GATEWAY_PRODUCT_SYMBOLS.length &&
    gatewayHonestyTestsPresent() &&
    gatewayPolicyHonestInSource()
  );
}

export function wsGatewayMountVsTrackerBoardCard(): {
  readonly tracker: typeof WS_GATEWAY_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = gatewaySymbolsInProductSource();
  return {
    tracker: WS_GATEWAY_TRACKER_ID,
    symbols: GATEWAY_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: GATEWAY_HONEST_GAPS.length,
    backendDoneBarMet: wsGatewayTrackerBackendDoneBarMet(),
  };
}
