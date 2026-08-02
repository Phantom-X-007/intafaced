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
assert(cat.length >= 8, 'catalog size');
assert(
  cat.every(function (c) {
    return c.path && c.label && c.id;
  }),
  'catalog fields'
);

var filtered = api.filterCmdItems(cat, 'withdraw');
assert(filtered.length === 1 && filtered[0].id === 'nav-withdraw', 'withdraw filter');

var none = api.filterCmdItems(cat, 'zzzz-not-a-route');
assert(none.length === 0, 'empty filter');

var m = api.marketToCmdItem({ coin: 'BTC', base: 'USDT', symbol: 'btc_usdt' });
assert(m && m.path === '/exchange/btc_usdt', 'market path');
assert(api.marketToCmdItem(null) === null, 'null market');
assert(api.marketToCmdItem({}) === null, 'empty market not invented');

console.log('cmd-palette.golden OK');
