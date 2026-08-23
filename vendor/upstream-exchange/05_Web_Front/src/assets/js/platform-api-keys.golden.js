'use strict';
/**
 * Fail-first: /platform mints identity.apiKeys and probes both doors with that key.
 * Run from 05_Web_Front: node src/assets/js/platform-api-keys.golden.js
 *
 * One key / scope / quota / sandbox plane. Trade stays CCXT; pay stays pay.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Platform.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle, name) {
  if (value.indexOf(needle) === -1) {
    throw new Error((name || 'missing') + ': ' + needle);
  }
}

assertContains(page, "mutate('identity', 'apiKeys.create'", 'Platform.vue must mint via identity.apiKeys.create');
assertContains(page, "query('identity', 'apiKeys.list'", 'list uses the same identity key plane');
assertContains(page, "rest('/markets'", 'trade door probe — CCXT /api/v1/markets with the minted key');
assertContains(page, "query('pay', 'health'", 'pay door probe — pay dialect with the same key');
assertContains(page, '{ token: key }', 'trade probe must send the minted key, not the session');
assertContains(page, "query('pay', 'health', undefined, key)", 'pay probe must send the minted key, not the session');
assertContains(page, 'keySandbox', 'sandbox flag on the card');
assertContains(page, "mode: this.keySandbox ? 'sandbox' : 'live'", 'mint must send sandbox|live');
assertContains(page, "intafaced.api.sandbox", 'sandbox label visible');
assertContains(page, 'IxState', 'named refuse surface');
assertContains(page, 'trade:read', 'trade scope on the card');
assertContains(page, 'pay:read', 'pay scope on the card');

if (/api_keys_v2|gateway_keys|createApiKeyTable/.test(page)) {
  throw new Error('do not invent a second key table');
}

assertContains(lang, 'api: {', 'en.js intafaced.api');
assertContains(lang, 'sandbox:', 'en.js intafaced.api.sandbox');
assertContains(lang, 'mint:', 'en.js intafaced.api.mint');
assertContains(lang, 'tradeDoor:', 'en.js intafaced.api.tradeDoor');
assertContains(lang, 'payDoor:', 'en.js intafaced.api.payDoor');
assertContains(lang, 'sandboxHint:', 'en.js intafaced.api.sandboxHint');

console.log('platform-api-keys.golden: ok');
