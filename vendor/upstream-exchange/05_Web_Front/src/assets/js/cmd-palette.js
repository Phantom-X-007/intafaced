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
 * Static navigation catalog — paths must exist in config/routes.js.
 * No invented destinations, balances, or market rows.
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
    { id: 'nav-ctc', label: 'C2C · not published', path: '/ctc', group: 'Trade', keywords: 'otc c2c socket' },
    {
      id: 'nav-otc',
      label: 'OTC desk',
      path: '/otc/trade/usdt',
      group: 'Trade',
      keywords: 'otc fiat peer'
    },
    { id: 'nav-login', label: 'Log in', path: '/login', group: 'Account', keywords: 'sign auth' },
    {
      id: 'nav-register',
      label: 'Sign up',
      path: '/register',
      group: 'Account',
      keywords: 'register'
    },
    {
      id: 'nav-findpwd',
      label: 'Reset password',
      path: '/findPwd',
      group: 'Account',
      keywords: 'forgot password recover'
    },
    {
      id: 'nav-money',
      label: 'Money / balances',
      path: '/uc/money',
      group: 'Account',
      keywords: 'wallet balance dual-book'
    },
    {
      id: 'nav-record',
      label: 'Trade fills / bill detail',
      path: '/uc/record',
      group: 'Account',
      keywords: 'history fills ledger'
    },
    {
      id: 'nav-recharge',
      label: 'Deposit',
      path: '/uc/recharge',
      group: 'Account',
      keywords: 'deposit fund custody'
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
      id: 'nav-entrust-current',
      label: 'Open orders',
      path: '/uc/entrust/current',
      group: 'Account',
      keywords: 'open orders working'
    },
    {
      id: 'nav-entrust-history',
      label: 'Order history',
      path: '/uc/entrust/history',
      group: 'Account',
      keywords: 'filled cancelled history'
    },
    {
      id: 'nav-ident',
      label: 'Verification (KYC)',
      path: '/identbusiness',
      group: 'Account',
      keywords: 'kyc identity verify merchant'
    },
    {
      id: 'nav-platform',
      label: 'Platform hub',
      path: '/platform',
      group: 'Platform',
      keywords: 'intafaced modules'
    },
    { id: 'nav-bank', label: 'Bank', path: '/bank', group: 'Platform', keywords: 'earn spaces loans' },
    { id: 'nav-pay', label: 'Pay', path: '/pay', group: 'Platform', keywords: 'payments' },
    { id: 'nav-p2p', label: 'P2P', path: '/p2p', group: 'Platform', keywords: 'peer' },
    { id: 'nav-token', label: 'Token', path: '/token', group: 'Platform', keywords: 'ifc supply' },
    { id: 'nav-agents', label: 'Agents', path: '/agents', group: 'Platform', keywords: 'ai agent' },
    {
      id: 'nav-blueprint',
      label: 'Blueprint',
      path: '/blueprint',
      group: 'Platform',
      keywords: 'template design'
    },
    { id: 'nav-protocol', label: 'Protocol', path: '/protocol', group: 'Platform', keywords: 'defi' },
    { id: 'nav-chain', label: 'Chain', path: '/chain', group: 'Platform', keywords: 'indexer network' },
    {
      id: 'nav-academy',
      label: 'Academy',
      path: '/academy',
      group: 'Platform',
      keywords: 'learn education'
    },
    {
      id: 'nav-launch',
      label: 'Launch',
      path: '/launch',
      group: 'Platform',
      keywords: 'launchpad factory'
    },
    { id: 'nav-invite', label: 'Invite', path: '/invite', group: 'Navigate', keywords: 'referral share' },
    { id: 'nav-lab', label: 'Lab', path: '/lab', group: 'Navigate', keywords: 'activity lab' },
    {
      id: 'nav-partner',
      label: 'Partner',
      path: '/partner',
      group: 'Navigate',
      keywords: 'partner programme'
    },
    {
      id: 'nav-about',
      label: 'About us',
      path: '/about-us',
      group: 'Help',
      keywords: 'company about'
    },
    { id: 'nav-help', label: 'Help · status', path: '/help', group: 'Help', keywords: 'faq support socket' },
    {
      id: 'nav-helplist',
      label: 'Help list · not published',
      path: '/help',
      group: 'Help',
      keywords: 'articles categories socket'
    },
    {
      id: 'nav-announce',
      label: 'Announcements · not published',
      path: '/announcement/0',
      group: 'Help',
      keywords: 'notice news socket'
    },
    {
      id: 'nav-notice',
      label: 'Notice board · not published',
      path: '/notice',
      group: 'Help',
      keywords: 'cms notice list socket'
    },
    {
      id: 'nav-app',
      label: 'App download · not published',
      path: '/app',
      group: 'Navigate',
      keywords: 'mobile apk store socket'
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
