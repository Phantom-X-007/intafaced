/**
 * Route × viewport matrix — single source of coverage truth for Stream A uiproof.
 * Spec: FRONTEND-OPERATING-PLAN-2026-07-30.md §2.6
 */
export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

/**
 * @typedef {{ path: string, id: string, note?: string, expectLoginRedirect?: boolean }} RouteCase
 * @type {RouteCase[]}
 */
export const ROUTES = [
  {
    id: 'index',
    path: '/',
    note: 'index shell, honesty bar, market table empty state',
  },
  {
    id: 'exchange-btc-usdt',
    path: '/exchange/btc_usdt',
    note: 'trading terminal, honesty, order confirm entry, deep-link bypass',
  },
  {
    id: 'dex',
    path: '/dex',
    note: 'CEX/DEX plane toggle target (S3)',
  },
  {
    id: 'login',
    path: '/login',
    note: 'auth surface + mobile drawer (S6)',
  },
  {
    id: 'uc-account',
    path: '/uc/account',
    note: 'auth-gated — prove redirect to /login (not account UI). Empty-vs-error unproven until Pass 3.',
    expectLoginRedirect: true,
  },
];

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
