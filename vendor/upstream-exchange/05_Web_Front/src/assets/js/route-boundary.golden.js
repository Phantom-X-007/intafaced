'use strict';

var boundary = require('./route-boundary.js');
var fs = require('fs');
var path = require('path');
var failed = 0;
function assert(value, name) {
  if (!value) { failed += 1; console.error('FAIL:', name); }
  else console.log('ok:', name);
}

assert(boundary.requestedPath({ fullPath: '/bank/cards?tab=active#issued' }) === '/bank/cards?tab=active#issued', 'keeps requested route evidence');
assert(boundary.requestedPath({ fullPath: 'https://attacker.invalid' }) === '/', 'refuses a non-path value');
var chunk = boundary.failure(new Error('ChunkLoadError: Loading chunk 42 failed'), { fullPath: '/pay' });
assert(chunk.code === 'route.chunk_unavailable' && chunk.path === '/pay', 'classifies lazy chunk failure');
assert(chunk.message.indexOf('current page has not been replaced') >= 0, 'failure copy states retained-page truth');
var unknown = boundary.failure(new Error('guard exploded'), { fullPath: '/bank' });
assert(unknown.code === 'route.navigation_failed', 'classifies non-chunk navigation failure');
assert(JSON.stringify(unknown).indexOf('guard exploded') < 0, 'does not disclose raw internal error');

var main = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');
var app = fs.readFileSync(path.join(__dirname, '../../App.vue'), 'utf8');
var view = fs.readFileSync(path.join(__dirname, '../../components/intafaced/RouteBoundary.vue'), 'utf8');
assert(main.indexOf("store.commit('routeLoading'") >= 0, 'router guard publishes requested loading state');
assert(main.indexOf("store.commit('routeReady'") >= 0, 'successful navigation clears the boundary');
assert(main.indexOf('router.onError') >= 0 && main.indexOf("store.commit('routeFailed'") >= 0, 'router loader errors publish typed failure');
assert(main.indexOf('store.state.routeBoundary.path') >= 0, 'failure keeps the requested path rather than the retained route');
assert(app.indexOf('<RouteBoundary') >= 0, 'shell delegates route state to its compatibility boundary');
assert(view.indexOf('ref="loading"') >= 0, 'shell renders loading boundary');
assert(view.indexOf('ref="failed"') >= 0, 'shell renders failure boundary');
assert(view.indexOf('this.$store.subscribe') >= 0 && view.indexOf('applyBoundary(state.routeBoundary)') >= 0, 'boundary follows every declared Vuex route transition');
assert(view.indexOf('.textContent =') >= 0, 'legacy boundary writes typed copy without HTML injection');
assert(app.indexOf('.ix-route-boundary-host[data-status="failed"] + .ix-route-ready') >= 0, 'stale route content is hidden after a failed navigation');

if (failed) process.exit(1);
console.log('\nroute-boundary.golden: all passed');
