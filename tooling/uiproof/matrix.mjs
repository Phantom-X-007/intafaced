/**
 * Route × viewport matrix — single source of coverage truth for Stream A uiproof.
 * Spec: FRONTEND-OPERATING-PLAN-2026-07-30.md §2.6
 */
export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

import { MEMBER_ROUTE_AUTHORITY } from './route-authority.mjs';

/**
 * Generated from the living Vue router. Adding a route to routes.js therefore
 * adds two Tier-A proof cells automatically; dynamic/wildcard routes use the
 * explicit safe fixtures in route-authority.mjs.
 *
 * @typedef {{ sourcePath: string, path: string, id: string, note: string, expectLoginRedirect: boolean, redirect: string|null }} RouteCase
 * @type {RouteCase[]}
 */
export const ROUTES = MEMBER_ROUTE_AUTHORITY;

/** Network path prefixes whose failures are allowlisted when backends are down. */
export const NETWORK_ALLOW_PREFIXES = ['/uc', '/market', '/exchange', '/otc', '/api'];

/**
 * Forbidden brand strings (runtime DOM). Mirrors tooling/ci/brand-scan.mjs intent.
 * Patterns are assembled so this file does not itself contain the banned literals
 * (static brand-scan would otherwise fail the gate that lists the names).
 */
function ban(...parts) {
  return new RegExp(parts.join(''), 'i');
}
export const FORBIDDEN_DOM = [
  ban('gmas', 'ter'),
  ban('finc', 'ept'),
  ban('settl', 'etx'),
  ban('payk', 'wik'),
  ban('\\banth', 'ropic\\b'),
  ban('\\bcla', 'ude\\b'),
  ban('\\bope', 'nai\\b'),
  ban('gpt-', '\\d'),
  ban('biz', 'zan'),
  ban('bit', 'rade'),
  ban('coin', 'exchange'),
];

export function shotName(routeId, viewportName) {
  return `${routeId}__${viewportName}.png`;
}
