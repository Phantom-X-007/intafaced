'use strict';

/**
 * Golden: remaining-SOT §12.3 / R08 — prefers-reduced-motion.
 * Run: node src/assets/js/desk-reduced-motion.golden.js
 *
 * Desk must not imply live-ness via motion when the user asked for reduced
 * motion, and must not use animation as the only freshness signal.
 *
 * Decision = is the desk live.
 * Authority = feedLive + chartProvenanceLabel + per-channel chip text.
 * States = live / snapshot / reduced-motion.
 * Falsifier = infinite pulse remains under prefers-reduced-motion with no text.
 */
var fs = require('fs');
var path = require('path');
var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    failed += 1;
  } else {
    console.log('ok', msg);
  }
}

function extractMedia(src, needle) {
  var out = [];
  var from = 0;
  for (;;) {
    var i = src.indexOf(needle, from);
    if (i < 0) break;
    var open = src.indexOf('{', i);
    if (open < 0) break;
    var depth = 0;
    var closed = false;
    for (var j = open; j < src.length; j++) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          out.push(src.slice(open + 1, j));
          from = j + 1;
          closed = true;
          break;
        }
      }
    }
    if (!closed) break;
  }
  return out;
}

var cssSrc = fs.readFileSync(path.join(__dirname, '../css/intafaced.css'), 'utf8');
var vueSrc = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var status = require('./ix-channel-status.js');

var reduceBlocks = extractMedia(cssSrc, '@media (prefers-reduced-motion: reduce)');
assert(reduceBlocks.length >= 2, 'intafaced.css has ≥2 prefers-reduced-motion: reduce blocks');

assert(
  reduceBlocks.some(function (b) {
    return /animation-iteration-count:\s*1/.test(b);
  }),
  'a reduce block kills infinite loops (animation-iteration-count: 1)'
);

assert(
  reduceBlocks.some(function (b) {
    return /\.ix-terminal/.test(b) && /animation:\s*none/.test(b);
  }),
  '.ix-terminal reduce block sets animation: none'
);

assert(
  reduceBlocks.some(function (b) {
    return /\.ix-terminal\s*,/.test(b) && /\.ix-terminal\s+\*/.test(b);
  }),
  '.ix-terminal and descendants are both covered'
);

assert(!/@keyframes/.test(vueSrc), 'Exchange.vue has no @keyframes');
assert(
  !/animation(?:-name|-iteration-count)?:[^;]*infinite/.test(vueSrc),
  'Exchange.vue has no infinite animation'
);

assert(
  /chartProvenanceLabel\s*\(/.test(vueSrc),
  'Exchange.vue computes chartProvenanceLabel'
);
assert(
  /\{\{\s*chartProvenanceLabel\s*\}\}/.test(vueSrc),
  'chart freshness is rendered as provenance text'
);
assert(
  /state\.live \? 'live'/.test(vueSrc),
  'chart live-ness is the word live in the provenance label'
);
assert(
  /class="ix-chart-provenance"/.test(vueSrc),
  'provenance sits in a text status element'
);

assert(
  /\{\{\s*chip\.label\s*\}\}/.test(vueSrc),
  'channel chips render label text, not a color-only swatch'
);
assert(
  /Session live/.test(vueSrc) && /Session not live/.test(vueSrc),
  'session live/not-live is banner text'
);
assert(
  /ix-head-status[\s\S]{0,400}\.ix-dot[\s\S]{0,80}display:\s*none/.test(cssSrc),
  'color-only live dot is hidden — chips are the signal'
);

assert(typeof status.classifyChannelStatus === 'function', 'channel helper loads');
var live = status.classifyChannelStatus({
  auth: true,
  trading: true,
  private: true,
  md: { depth: true, trades: { reachable: true }, candles: { live: true } },
  clock: true,
  schema: { version: 2 },
  deps: true
});
var down = status.classifyChannelStatus({
  auth: false,
  trading: false,
  private: false,
  md: { depth: false, trades: { reachable: false }, candles: { status: 'failed' } },
  clock: false,
  schema: false,
  deps: false
});

assert(
  live.chips.every(function (c) {
    return typeof c.label === 'string' && c.label.length > 0 && !/#[0-9a-fA-F]{3,8}/.test(c.label);
  }),
  'live chips are words, not hex'
);
assert(
  live.chips.some(function (c) {
    return c.id === 'md.depth' && /live/i.test(c.label);
  }),
  'depth live is the word live on a chip'
);
assert(
  down.chips.some(function (c) {
    return c.id === 'md.depth' && /not live/i.test(c.label);
  }),
  'depth down is the words not live on a chip'
);
assert(live.sessionLive === true, 'all-live facts → sessionLive');
assert(down.sessionLive !== true, 'all-failed facts do not invent sessionLive');
assert(/Session live/.test(vueSrc), 'sessionLive true paints Session live');
assert(/Session not live/.test(vueSrc), 'sessionLive false paints Session not live');

if (failed) {
  console.error(failed + ' golden failure(s)');
  process.exit(1);
}
console.log('all desk-reduced-motion golden tests passed');
