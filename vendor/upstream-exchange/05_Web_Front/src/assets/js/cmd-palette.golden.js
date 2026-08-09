/**
 * Golden: cmd-palette filter does not invent markets; ranking is substring only.
 * Run: node src/assets/js/cmd-palette.golden.js
 */
var api = require('./cmd-palette.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
}

var cat = api.defaultCmdCatalog();
assert(cat.length >= 30, 'catalog expanded from real routes');
assert(
  cat.every(function (c) {
    return c.path && c.label && c.id;
  }),
  'catalog fields'
);

// Paths must be real router destinations — no invented segments.
var required = [
  '/',
  '/exchange',
  '/dex',
  '/ctc',
  '/otc/trade/usdt',
  '/login',
  '/register',
  '/findPwd',
  '/uc/money',
  '/uc/record',
  '/uc/recharge',
  '/uc/withdraw',
  '/uc/safe',
  '/uc/account',
  '/uc/order',
  '/uc/entrust/current',
  '/uc/entrust/history',
  '/identbusiness',
  '/platform',
  '/bank',
  '/pay',
  '/p2p',
  '/token',
  '/agents',
  '/blueprint',
  '/protocol',
  '/chain',
  '/academy',
  '/launch',
  '/invite',
  '/lab',
  '/partner',
  '/about-us',
  '/help',
  // helplist catalog entry now routes to honest /help hub
  '/announcement/0',
  '/notice',
  '/app'
];
required.forEach(function (p) {
  assert(
    cat.some(function (c) {
      return c.path === p;
    }),
    'catalog includes real route ' + p
  );
});

// No whitepaper — route deliberately absent (invent PDF removed).
assert(
  !cat.some(function (c) {
    return /whitepaper/i.test(c.path + c.id + c.label);
  }),
  'no whitepaper invent path'
);

// Socket surfaces must not look like live product in the palette.
assert(
  cat.some(function (c) {
    return c.path === '/ctc' && /not published/i.test(c.label);
  }),
  'ctc labeled not published'
);
assert(
  !cat.some(function (c) {
    return c.path === '/helplist';
  }),
  'no fake help-list destination'
);
assert(
  cat.some(function (c) {
    return c.id === 'nav-helplist' && c.path === '/help';
  }),
  'help list entry points at /help hub'
);


var filtered = api.filterCmdItems(cat, 'withdraw');
assert(
  filtered.length >= 1 && filtered.some(function (c) {
    return c.id === 'nav-withdraw';
  }),
  'withdraw filter'
);

var none = api.filterCmdItems(cat, 'zzzz-not-a-route');
assert(none.length === 0, 'empty filter');

var m = api.marketToCmdItem({ coin: 'BTC', base: 'USDT', symbol: 'btc_usdt' });
assert(m && m.path === '/exchange/btc_usdt', 'market path');
assert(api.marketToCmdItem(null) === null, 'null market');
assert(api.marketToCmdItem({}) === null, 'empty market not invented');

console.log('cmd-palette.golden OK');
