#!/usr/bin/env node
'use strict';
/**
 * remaining-SOT §19.7.4 / GO Layer A residual — chart live STOMP / as-of honesty.
 *
 * The desk chart is a svc-trade REST snapshot. STOMP is not mounted.
 * Public depth (ixDepthFeed) is a same-origin WS book, not STOMP.
 * Fake WebSocket in tooling/uiproof/chart-live.spec.mjs is a capability test,
 * not a production STOMP client.
 *
 * Run: node vendor/upstream-exchange/05_Web_Front/src/assets/js/chart-stomp-refuse.golden.js
 *
 * Falsifier: Exchange claims live by default, or the member shell assigns a
 * real stompClient.
 */
var fs = require('fs');
var path = require('path');

var failed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else {
    console.log('ok', name);
  }
}

var jsRoot = __dirname;
var exchange = fs.readFileSync(path.join(jsRoot, '../../pages/exchange/Exchange.vue'), 'utf8');
var kline = fs.readFileSync(path.join(jsRoot, 'market-chart/kline.js'), 'utf8');
var depth = fs.readFileSync(path.join(jsRoot, 'ix-depth-feed.js'), 'utf8');

function methodBody(src, name) {
  var re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) return null;
  var i = m.index + m[0].length - 1;
  var depthCount = 0;
  for (var j = i; j < src.length; j++) {
    var ch = src.charAt(j);
    if (ch === '{') depthCount += 1;
    else if (ch === '}') {
      depthCount -= 1;
      if (depthCount === 0) return src.slice(i + 1, j);
    }
  }
  return null;
}

function realStompAssignments(src) {
  var re = /stompClient\s*[:=]\s*([^\n;]+)/g;
  var found = [];
  var m;
  while ((m = re.exec(src))) {
    if (!/^\s*null\b/.test(m[1])) found.push(m[0].trim());
  }
  return found;
}

/* ── 1. Default chartProvenance.live is false ─────────────────────────── */
var provenance = exchange.match(/chartProvenance:\s*\{[\s\S]*?\n\s{6}\}/);
assert(!!provenance, 'chartProvenance default object present');
assert(provenance && /\blive:\s*false\b/.test(provenance[0]), 'default chartProvenance.live is false');
assert(provenance && !/\blive:\s*true\b/.test(provenance[0]), 'default chartProvenance.live is not true');

/* ── 2–3. Label copy: REST snapshot; stream live only when live; as-of ── */
var labelBody = methodBody(exchange, 'chartProvenanceLabel');
assert(!!labelBody, 'chartProvenanceLabel computed present');
assert(labelBody && labelBody.indexOf('REST snapshot') !== -1, 'label copy includes REST snapshot');
assert(labelBody && labelBody.indexOf("state.live ? 'live'") !== -1, "stream live only when state.live is true");
assert(labelBody && labelBody.indexOf('latest candle') !== -1 && /\[UTC\]/.test(labelBody), 'as-of is latest candle + UTC');

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}
function mockMoment(ms) {
  return {
    utc: function () {
      return {
        format: function () {
          var d = new Date(ms);
          return (
            d.getUTCFullYear() +
            '-' +
            pad(d.getUTCMonth() + 1) +
            '-' +
            pad(d.getUTCDate()) +
            ' ' +
            pad(d.getUTCHours()) +
            ':' +
            pad(d.getUTCMinutes()) +
            ' UTC'
          );
        }
      };
    }
  };
}

function labelFor(state) {
  var fn = new Function(
    'moment',
    '"use strict"; return function chartProvenanceLabel() {' + labelBody + '\n}'
  );
  return fn(mockMoment).call({ chartProvenance: state });
}

var loading = labelFor({
  status: 'loading',
  live: false,
  source: 'svc-trade REST snapshot'
});
assert(loading.indexOf('REST snapshot') !== -1, 'loading label names REST snapshot');
assert(loading.indexOf('stream live') === -1, 'loading label does not claim stream live');

var asOfMs = Date.UTC(2026, 8, 2, 10, 2, 0);
var snapshotOk = labelFor({
  status: 'ok',
  live: false,
  source: 'svc-trade REST snapshot',
  latestCandleTimeMs: asOfMs
});
assert(snapshotOk.indexOf('REST snapshot') !== -1, 'ok snapshot label names REST snapshot');
assert(snapshotOk.indexOf('stream live') === -1, 'ok snapshot does not claim stream live');
assert(snapshotOk.indexOf('latest candle') !== -1, 'ok snapshot names latest candle');
assert(snapshotOk.indexOf('2026-09-02 10:02 UTC') !== -1, 'as-of is latest candle UTC');

var liveOk = labelFor({
  status: 'ok',
  live: true,
  source: 'svc-trade REST snapshot + svc-ws public trade stream',
  latestCandleTimeMs: asOfMs,
  transport: 'live'
});
assert(liveOk.indexOf('stream live') !== -1, 'stream live only when state.live is true');

/* ── 4. No real stompClient in the member shell ───────────────────────── */
var exchangeStomp = realStompAssignments(exchange);
var klineStomp = realStompAssignments(kline);
assert(exchangeStomp.length === 0, 'Exchange.vue stompClient absent or null');
assert(klineStomp.length === 0, 'kline.js stompClient absent or null');
assert(kline.indexOf('stompClient') === -1, 'kline.js has no stompClient symbol');
assert(!/require\([^)]*stomp/i.test(exchange), 'Exchange.vue does not require a STOMP client');
assert(!/require\([^)]*stomp/i.test(kline), 'kline.js does not require a STOMP client');
assert(!/@stomp\//i.test(kline) && !/\bStomp\.(over|client)\b/.test(kline), 'kline.js mounts no STOMP client');
assert(kline.indexOf('createTradeCandleFeed') !== -1, 'kline public trade feed is not STOMP');

/* ── 5. feedLive defaults false; stopDepthFeed sets false ─────────────── */
var dataFeed = exchange.match(/\n      feedLive:\s*(true|false)/);
assert(dataFeed && dataFeed[1] === 'false', 'feedLive defaults false');
var stopBody = methodBody(exchange, 'stopDepthFeed');
assert(!!stopBody, 'stopDepthFeed present');
assert(stopBody && /this\.feedLive\s*=\s*false/.test(stopBody), 'stopDepthFeed sets feedLive false');

/* ── 6. Public depth is not STOMP and must not be labeled STOMP ───────── */
assert(!/stomp/i.test(depth), 'ix-depth-feed.js is not STOMP');
var startBody = methodBody(exchange, 'startDepthFeed');
assert(!!startBody, 'startDepthFeed present');
assert(startBody && !/stomp/i.test(startBody), 'startDepthFeed is not labeled STOMP');
assert(startBody && startBody.indexOf('ixDepthFeed.createDepthFeed') !== -1, 'public depth uses ixDepthFeed');
assert(/Public depth stream/.test(exchange), 'depth feed named public, not STOMP');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('chart-stomp-refuse.golden: ok');
process.exit(0);
