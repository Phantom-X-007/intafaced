/**
 * D26-P4-C1 — web.terminal mount vs tracker honest gaps.
 *
 * Vendored Vue desk wired to live depth feed + wire/money gates on tip.
 * Brand drain / snapshot provenance L11 residuals stay Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_TERMINAL_TRACKER_ID = 'web.terminal' as const;

export const TERMINAL_PRODUCT_PATHS = [
  'pages/exchange/Exchange.vue',
  'assets/js/ix-depth-feed.js',
  'assets/js/ix-depth-feed.golden.js',
  'assets/js/ix-wire.js',
  'assets/js/ix-money.js',
] as const;

export const TERMINAL_HONEST_GAPS = [
  'gap.brand_drain_l11',
  'gap.depth_number_refuse_l11',
  'gap.snapshot_provenance_l11',
] as const;

export function terminalProductPathsPresent(): readonly string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return TERMINAL_PRODUCT_PATHS.filter((rel) => existsSync(join(here, rel)));
}

export function terminalDepthFeedWiredInExchange(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const exchangeSrc = readFileSync(join(here, 'pages/exchange/Exchange.vue'), 'utf8');
  const feedSrc = readFileSync(join(here, 'assets/js/ix-depth-feed.js'), 'utf8');
  return /ix-depth-feed|depth-feed|applyDelta/.test(exchangeSrc) && /applyDelta/.test(feedSrc);
}

export function terminalWireGatePresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'assets/js/ix-wire.js'), 'utf8');
  return existsSync(join(here, 'assets/js/ix-wire.js')) && /refuse|float|decimal/i.test(src);
}

export function webTerminalTrackerBackendDoneBarMet(): boolean {
  return (
    terminalProductPathsPresent().length === TERMINAL_PRODUCT_PATHS.length &&
    terminalDepthFeedWiredInExchange() &&
    terminalWireGatePresent()
  );
}

export function webTerminalMountVsTrackerBoardCard(): {
  readonly tracker: typeof WEB_TERMINAL_TRACKER_ID;
  readonly paths: number;
  readonly pathsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = terminalProductPathsPresent();
  return {
    tracker: WEB_TERMINAL_TRACKER_ID,
    paths: TERMINAL_PRODUCT_PATHS.length,
    pathsPresent: present.length,
    gaps: TERMINAL_HONEST_GAPS.length,
    backendDoneBarMet: webTerminalTrackerBackendDoneBarMet(),
  };
}
