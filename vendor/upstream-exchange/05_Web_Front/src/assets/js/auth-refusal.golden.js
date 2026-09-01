'use strict';

var fs = require('fs');
var path = require('path');
var bus = require('./auth-refusal.js');

function assert(value, message) {
  if (!value) throw new Error(message);
}

var first = 0;
var second = 0;
var unsubscribe = bus.subscribe(function (details) {
  first += 1;
  assert(details.status === 401, 'refusal details are delivered');
});
bus.subscribe(function () { second += 1; });
bus.signal({ status: 401 });
unsubscribe();
bus.signal({ status: 401 });
assert(first === 1, 'unsubscribe stops later delivery');
assert(second === 2, 'each refusal reaches active subscribers');

var root = path.resolve(__dirname, '../..');
var client = fs.readFileSync(path.join(root, 'config/intafaced.js'), 'utf8');
var main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
var exchange = fs.readFileSync(path.join(root, 'pages/exchange/Exchange.vue'), 'utf8');

assert(client.indexOf("verdict.reason === REASON.UNAUTHORIZED") !== -1,
  'platform fetch transport signals classified unauthorized responses');
assert(client.indexOf('authRefusal.signal({ status: res.status, url: url })') !== -1,
  'platform fetch transport emits through the shared refusal channel');
assert(main.indexOf("authRefusal.subscribe(function ()") !== -1,
  'the application subscribes once at its session authority');
assert(main.indexOf("if (!store.getters.ixSession) return") !== -1,
  'concurrent or logged-out refusals are idempotent');
assert(main.indexOf("store.commit('clearIxSession')") !== -1,
  'a refusal atomically destroys the in-memory session');
assert(main.indexOf("router.replace({ path: '/login', query: { redirect: redirect } })") !== -1,
  'a protected route retains its safe return target');
assert(main.indexOf("transport: 'vue-resource'") !== -1,
  'legacy transport uses the same refusal path');
assert(exchange.indexOf('stopCodStream();') !== -1 && exchange.indexOf('stopDropCopyStream();') !== -1,
  'session loss closes both private exchange streams');

console.log('auth-refusal.golden: ok');
