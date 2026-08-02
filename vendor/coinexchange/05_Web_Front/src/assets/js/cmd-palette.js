/**
 * Global command palette (⌘K / Ctrl+K) — pure helpers for filter + ranking.
 * No fake market rows: callers pass only real routes / known symbols.
 */

/** @typedef {{ id: string, label: string, hint?: string, path: string, keywords?: string, group?: string }} CmdItem */

/**
 * @param {CmdItem[]} items
 * @param {string} query
 * @returns {CmdItem[]}
 */
function filterCmdItems(items, query) {
  var q = String(query || '')
    .trim()
    .toLowerCase();
  if (!q) return items.slice();
  return items.filter(function (it) {
    var hay = (
      (it.label || '') +
      ' ' +
      (it.hint || '') +
      ' ' +
      (it.path || '') +
      ' ' +
      (it.keywords || '') +
      ' ' +
      (it.group || '')
    ).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

/**
 * Static navigation catalog (routes only — no invented balances/prices).
 * @returns {CmdItem[]}
 */
function defaultCmdCatalog() {
  return [
    { id: 'nav-home', label: 'Home', path: '/', group: 'Navigate', keywords: 'index start' },
    {
      id: 'nav-exchange',
      label: 'Exchange desk',
      path: '/exchange',
      group: 'Trade',
      keywords: 'cex spot trade terminal'
    },
    {
      id: 'nav-dex',
      label: 'DEX · non-custodial',
      path: '/dex',
      group: 'Trade',
      keywords: 'protocol non-custodial'
    },
    { id: 'nav-login', label: 'Log in', path: '/login', group: 'Account', keywords: 'sign auth' },
    { id: 'nav-register', label: 'Sign up', path: '/register', group: 'Account', keywords: 'register' },
    {
      id: 'nav-money',
      label: 'Money / balances',
      path: '/uc/money',
      group: 'Account',
      keywords: 'wallet balance dual-book'
    },
    {
      id: 'nav-withdraw',
      label: 'Withdraw',
      path: '/uc/withdraw',
      group: 'Account',
      keywords: 'cash out transfer'
    },
    {
      id: 'nav-safe',
      label: 'Security',
      path: '/uc/safe',
      group: 'Account',
      keywords: '2fa password'
    },
    {
      id: 'nav-account',
      label: 'Account settings',
      path: '/uc/account',
      group: 'Account',
      keywords: 'profile'
    },
    {
      id: 'nav-orders',
      label: 'My orders (OTC)',
      path: '/uc/order',
      group: 'Account',
      keywords: 'orders history'
    },
    {
      id: 'nav-platform',
      label: 'Platform hub',
      path: '/platform',
      group: 'Platform',
      keywords: 'intafaced modules'
    },
    { id: 'nav-bank', label: 'Bank', path: '/bank', group: 'Platform', keywords: 'earn' },
    { id: 'nav-pay', label: 'Pay', path: '/pay', group: 'Platform', keywords: 'payments' },
    { id: 'nav-p2p', label: 'P2P', path: '/p2p', group: 'Platform', keywords: 'peer' },
    { id: 'nav-protocol', label: 'Protocol', path: '/protocol', group: 'Platform', keywords: 'defi' },
    { id: 'nav-ctc', label: 'C2C Exchange', path: '/ctc', group: 'Trade', keywords: 'otc c2c' },
    { id: 'nav-help', label: 'Help', path: '/help', group: 'Help', keywords: 'faq support' },
    {
      id: 'nav-announce',
      label: 'Announcements',
      path: '/announcement/0',
      group: 'Help',
      keywords: 'notice news'
    }
  ];
}

/**
 * Map a live market row into a cmd item when the caller has real symbols.
 * @param {{ symbol?: string, coin?: string, base?: string }} m
 * @returns {CmdItem|null}
 */
function marketToCmdItem(m) {
  if (!m) return null;
  var coin = m.coin || '';
  var base = m.base || '';
  var symbol = m.symbol || (coin && base ? coin + '_' + base : '');
  if (!symbol && !coin) return null;
  var pair = (coin && base ? coin + '/' + base : symbol).toUpperCase();
  var pathPair = String(symbol || coin + '_' + base).toLowerCase();
  return {
    id: 'mkt-' + pathPair,
    label: pair,
    path: '/exchange/' + pathPair,
    group: 'Markets',
    keywords: 'pair market ' + pathPair,
    hint: 'Open desk'
  };
}

var api = {
  filterCmdItems: filterCmdItems,
  defaultCmdCatalog: defaultCmdCatalog,
  marketToCmdItem: marketToCmdItem
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof window !== 'undefined') {
  window.ixCmdPalette = api;
}
