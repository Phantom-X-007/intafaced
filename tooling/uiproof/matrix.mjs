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

  // ── The two deep platform verticals ────────────────────────────────────
  //
  // Every screen of /bank and /pay is listed, not a sample. These pages exist
  // to render REFUSALS honestly — no session here carries bank:read or
  // pay:read, so what this pass proves is that a screen refused with a named
  // reason and did not throw, blank, or spin. A sampled matrix would leave the
  // untested screens free to regress into exactly the flat page they replaced.
  //
  // None of them is `expectLoginRedirect`: they carry no `requiresAuth` meta on
  // purpose. A signed-out reader is shown WHICH capability the session lacks,
  // which is a truer answer than a bounce to /login — several of these surfaces
  // (hosted checkout, service health) are legitimately public.
  { id: 'bank', path: '/bank', note: 'bank vertical — overview: spaces, unnamed assets, borrowing health' },
  { id: 'bank-spaces', path: '/bank/spaces', note: 'spaces.list / create / archive / unnamed' },
  {
    id: 'bank-transfers',
    path: '/bank/transfers',
    note: 'transfers.create / schedule / listSchedules / executions / pause / resume / cancel',
  },
  { id: 'bank-earn', path: '/bank/earn', note: 'earn.pools / positions / deposit / withdraw' },
  { id: 'bank-loans', path: '/bank/loans', note: 'loans.products / list / health / open / addCollateral / repay / close' },
  { id: 'bank-cards', path: '/bank/cards', note: 'cards.programme / list / issue / setStatus / authorizations' },
  { id: 'bank-ramps', path: '/bank/ramps', note: 'ramps.programme / onramps / offramps / offramp — fiat leg is a stated socket' },
  { id: 'bank-analytics', path: '/bank/analytics', note: 'analytics.spend over a client-chosen window' },
  { id: 'pay', path: '/pay', note: 'pay vertical — overview: health, railHealth, merchant.me' },
  { id: 'pay-money', path: '/pay/money', note: 'withdrawal.balance / mine / create — interactive-only scope refuses by name' },
  { id: 'pay-merchant', path: '/pay/merchant', note: 'merchant.me / create / submitKyb / decideKybStub / profile / balances' },
  { id: 'pay-links', path: '/pay/links', note: 'merchant.listLinks / createLink / deactivateLink' },
  { id: 'pay-payments', path: '/pay/payments', note: 'payment.list / create / authorize / capture / refund / history' },
  { id: 'pay-settlements', path: '/pay/settlements', note: 'settlement.run / get / payout — no list procedure exists, screen says so' },
  { id: 'pay-checkout', path: '/pay/checkout', note: 'resolveLink / checkout.open / checkout.status — public, no session sent' },
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
