/**
 * Golden tests for desk-prefs.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/desk-prefs.golden.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var prefs = require(path.join(__dirname, 'desk-prefs.js'));

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(prefs.clampPanelWidth('markets', 100) === 160, 'markets floor 160');
assert(prefs.clampPanelWidth('markets', 999) === 320, 'markets ceiling 320');
assert(prefs.clampPanelWidth('markets', 200) === 200, 'markets mid ok');
assert(prefs.clampPanelWidth('rail', 50) === 200, 'rail floor');
assert(prefs.clampPanelWidth('order', 500) === 400, 'order ceiling');
assert(prefs.clampPanelWidth('nope', 1) === 0, 'unknown key → 0');

var n = prefs.normalizePanelWidths(null);
assert(n.markets === 208 && n.rail === 252 && n.order === 296, 'defaults when null');
var n2 = prefs.normalizePanelWidths({ markets: 50, rail: 'bogus', order: 300 });
assert(n2.markets === 160 && n2.rail === 252 && n2.order === 300, 'bad values clamped');

var indicators = prefs.normalizeIndicatorVisibility({ rsi: false, macd: true });
assert(indicators.rsi === false && indicators.macd === true, 'indicator visibility persists');
var indicatorDefaults = prefs.normalizeIndicatorVisibility({ rsi: 'no', macd: null });
assert(indicatorDefaults.rsi === true && indicatorDefaults.macd === true, 'bad indicator prefs default on');

assert(prefs.panelWidthAfterDrag('markets', 208, 40) === 248, 'drag right grows markets');
assert(prefs.panelWidthAfterDrag('markets', 208, -100) === 160, 'drag left clamps floor');
assert(prefs.panelWidthAfterDrag('order', 296, 200) === 400, 'drag clamps ceiling');

var g = prefs.deskGridTemplate({ markets: 200, rail: 260, order: 300 });
assert(
  g === '200px 6px minmax(0, 1fr) 6px 260px 6px 300px',
  'grid template string'
);

function memoryStorage(seed) {
  var values = Object.assign({}, seed || {});
  return {
    values: values,
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; }
  };
}

var aliceKey = prefs.storageKey('user/alice');
var bobKey = prefs.storageKey('user/bob');
assert(aliceKey !== bobKey && aliceKey.indexOf('p-user%2Falice') >= 0, 'storage keys are principal scoped');
assert(prefs.storageKey('') === prefs.STORAGE_PREFIX + ':guest', 'anonymous layout has an explicit guest scope');

var storage = memoryStorage();
var saved = prefs.write(storage, 'alice', {
  pair: 'ETH_USDT',
  bookMode: 'asks',
  bookGroup: 50,
  interval: '1D',
  mainTab: 'depth',
  railTab: 'trades',
  baseFilter: 'favor',
  accountTab: 'fills',
  side: 'SELL',
  panels: { markets: 999, rail: 210, order: 120 },
  indicators: { rsi: false, macd: true },
  bearer: 'must-not-survive'
});
assert(saved.ok, 'valid layout envelope saves');
var storedEnvelope = JSON.parse(storage.values[prefs.storageKey('alice')]);
assert(storedEnvelope.version === 2 && storedEnvelope.principal === 'p-alice', 'saved envelope pins version and principal');
assert(!Object.prototype.hasOwnProperty.call(storedEnvelope.layout, 'bearer'), 'unknown and sensitive fields are discarded');
assert(storedEnvelope.layout.panels.markets === 320 && storedEnvelope.layout.panels.order === 240, 'saved widths are clamped');
assert(!Object.prototype.hasOwnProperty.call(storedEnvelope.layout.panels, 'rail'), 'obsolete four-column rail width is not persisted');
var loaded = prefs.read(storage, 'alice');
assert(loaded.ok && loaded.layout.pair === 'eth_usdt' && loaded.layout.side === 'SELL', 'same principal reads normalized layout');
assert(!prefs.read(storage, 'bob').ok, 'another principal cannot read the saved layout');

var swapped = memoryStorage();
swapped.values[prefs.storageKey('bob')] = storage.values[prefs.storageKey('alice')];
var refused = prefs.read(swapped, 'bob');
assert(!refused.ok && refused.reason === 'principal', 'moved envelope refuses a mismatched principal');
assert(swapped.getItem(prefs.storageKey('bob')) === null, 'refused envelope is removed');

var corrupt = memoryStorage();
corrupt.values[prefs.storageKey('alice')] = '{broken';
var corruptResult = prefs.read(corrupt, 'alice');
assert(!corruptResult.ok && corruptResult.reason === 'corrupt', 'corrupt JSON is classified');
assert(corrupt.getItem(prefs.storageKey('alice')) === null, 'corrupt JSON is removed');

var legacy = memoryStorage();
legacy.values[prefs.LEGACY_STORAGE_KEY] = JSON.stringify({ mainTab: 'book', panels: { markets: 240 } });
var guestMigration = prefs.migrateLegacyGuest(legacy, '');
assert(guestMigration.ok && guestMigration.migrated, 'unscoped v1 layout migrates only to guest');
assert(legacy.getItem(prefs.LEGACY_STORAGE_KEY) === null, 'successful legacy migration removes v1');
assert(prefs.read(legacy, '').layout.mainTab === 'book', 'guest migration preserves whitelisted choices');

var authLegacy = memoryStorage();
authLegacy.values[prefs.LEGACY_STORAGE_KEY] = JSON.stringify({ side: 'SELL' });
var authMigration = prefs.migrateLegacyGuest(authLegacy, 'alice');
assert(!authMigration.ok && authMigration.reason === 'legacy_unscoped', 'authenticated principal refuses ownerless v1 data');
assert(authLegacy.getItem(prefs.LEGACY_STORAGE_KEY) !== null, 'refusal does not destroy another guest layout');

var quotaStorage = memoryStorage();
quotaStorage.setItem = function () { var error = new Error('full'); error.name = 'QuotaExceededError'; throw error; };
assert(prefs.write(quotaStorage, 'alice', {}).reason === 'quota', 'quota refusal is classified for observable UI');

var unavailableStorage = memoryStorage();
unavailableStorage.getItem = function () { throw new Error('private mode'); };
assert(prefs.read(unavailableStorage, 'alice').reason === 'storage_unavailable', 'read refusal is classified');

assert(prefs.remove(storage, 'alice').ok && !prefs.read(storage, 'alice').ok, 'reset removes only the active principal layout');

var exchangeSource = fs.readFileSync(
  path.join(__dirname, '../../pages/exchange/Exchange.vue'),
  'utf8'
);
assert(exchangeSource.indexOf('>Reset layout</button>') >= 0, 'exchange exposes an explicit reset control');
assert((exchangeSource.match(/role="separator"/g) || []).length === 3, 'all three column handles remain separators');
assert((exchangeSource.match(/:aria-valuenow="panelW\./g) || []).length === 3, 'all separators expose their current value');
assert((exchangeSource.match(/@keydown="resizePanelByKey\(/g) || []).length === 3, 'all separators support keyboard resizing');
assert(exchangeSource.indexOf('deskPrefs.write(') >= 0, 'exchange saves through the versioned preference boundary');
assert(exchangeSource.indexOf("subjectOf(this.ixToken) || ''") >= 0, 'exchange scopes storage to the current platform principal');
assert(exchangeSource.indexOf("'--ix-market-column-width': w.markets + 'px'") >= 0, 'saved market width reaches the live CSS grid');
assert(exchangeSource.indexOf("'--ix-right-column-width': w.order + 'px'") >= 0, 'saved shared right width reaches the live CSS grid');
assert(exchangeSource.indexOf('var(--ix-market-column-width, 200px)') >= 0, 'current three-column composition consumes saved widths');

if (failed) {
  console.error('\n' + failed + ' desk-prefs golden assertion(s) failed');
  process.exit(1);
}
console.log('\ndesk-prefs golden: all passed');
process.exit(0);
