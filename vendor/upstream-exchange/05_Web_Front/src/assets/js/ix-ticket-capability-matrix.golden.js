/* PTX-M07-R04 — executable ticket capability matrix.
 *
 * Matching/trade arms ∪ visible ticket buttons.
 * LIVE helper | REFUSE helper | MISSING (fail).
 * LIVE helper + no Vue type-strip control = fail until Codex LOOK mounts chrome.
 * REFUSE helper + no Vue control = expected until LOOK (pass).
 * Does not invent matching engines. Does not restyle Exchange.vue.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var HERE = __dirname;
var ROOT = path.resolve(HERE, '../../../../../../');
var ENGINE_DIR = path.join(ROOT, 'services/svc-matching/src/engine');
var TRADE_DIR = path.join(ROOT, 'services/svc-trade/src/spot');
var VUE = path.join(HERE, '../../pages/exchange/Exchange.vue');

function mustDir(p, label) {
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    throw new Error('capability matrix cannot find ' + label + ' at ' + p);
  }
}
mustDir(ENGINE_DIR, 'matching engine');
mustDir(TRADE_DIR, 'trade spot');
mustDir(HERE, 'ticket helpers');

/** Venue/infra — not a member ticket order/strategy door. */
var SKIP_ENGINE = {
  book: true,
  engine: true,
  journal: true,
  types: true,
  'depth-memo': true,
  'dual-target-one-book': true,
  halt: true,
  prelaunch: true,
  'venue-kill': true,
  session: true,
  'mass-cancel': true,
  'min-notional': true,
  'amend-priority': true,
  'auction-uncross': true,
  'bulk-items': true,
  'cert-refuse': true,
  'cod-fence': true,
  collars: true,
  'collars-policy': true,
  'combo-book': true,
  'core-tif': true,
  'halt-law': true,
  ifm: true,
  'ifm-crash': true,
  'journal-codec': true,
  'journal-gaps': true,
  'journal-io': true,
  'journal-persist': true,
  'journal-replay': true,
  'journal-wire': true,
  'l3-queue': true,
  liquidity: true,
  'mass-quote': true,
  mmp: true,
  'option-combo': true,
  'rulebook-refuse': true,
  'split-brain': true,
  'surveillance-case': true,
  'surveillance-persist': true
};

/** Market-lifecycle place — not a ticket intent the member calls. */
var SKIP_TRADE = {
  'market-delisted-place': true,
  'market-expired-place': true,
  'market-halt-place': true,
  'market-prelaunch-place': true,
  'venue-halt-place': true
};

/** Existing engine/place filenames → one ticket door. Aliases collapse variants. */
var ENGINE_DOOR = {
  aon: 'aon',
  auction: 'auction',
  bracket: 'bracket',
  'close-position': 'close',
  collar: 'collar',
  expire: 'gtd',
  fok: 'fok',
  iceberg: 'iceberg',
  ioc: 'ioc',
  'min-qty': 'min-qty',
  'oco-cancel': 'oco-cancel',
  'oco-link': 'oco',
  option: 'option-place',
  peg: 'peg',
  'post-only': 'post-only',
  'post-only-market': 'post-only',
  'reduce-only-market': 'reduce-only',
  'self-trade': 'self-trade',
  'stop-limit': 'stop-limit',
  'trailing-stop': 'trailing'
};

var TRADE_DOOR = {
  'aon-place': 'aon',
  'auction-place': 'auction',
  'bracket-place': 'bracket',
  'close-position': 'close',
  'matching-close': 'close',
  'collar-place': 'collar',
  'fok-place': 'fok',
  'gtd-gtt-place': 'gtd',
  'iceberg-place': 'iceberg',
  'ioc-place': 'ioc',
  'min-qty-place': 'min-qty',
  'oco-place': 'oco',
  'oco-cancel': 'oco-cancel',
  'option-place': 'option-place',
  'peg-place': 'peg',
  'post-only-place': 'post-only',
  'market-post-only-place': 'post-only',
  'reduce-only-place': 'reduce-only',
  'market-reduce-only-place': 'reduce-only',
  'self-trade-place': 'self-trade',
  'stop-limit-place': 'stop-limit',
  'trailing-stop-place': 'trailing'
};

var HELPER_FILE = {
  aon: 'ix-aon-ticket.js',
  auction: 'ix-auction-ticket.js',
  bracket: 'ix-bracket-ticket.js',
  close: 'ix-close-ticket.js',
  collar: 'ix-collar-ticket.js',
  fok: 'ix-fok-ticket.js',
  gtd: 'ix-gtd-ticket.js',
  iceberg: 'ix-iceberg-ticket.js',
  ioc: 'ix-ioc-ticket.js',
  'min-qty': 'ix-min-qty-ticket.js',
  oco: 'ix-oco-ticket.js',
  'oco-cancel': 'ix-oco-cancel-ticket.js',
  'option-place': 'ix-option-place-ticket.js',
  peg: 'ix-peg-ticket.js',
  'post-only': 'ix-post-only-ticket.js',
  'reduce-only': 'ix-reduce-only-ticket.js',
  'self-trade': 'ix-self-trade-ticket.js',
  'stop-limit': 'ix-stop-limit-ticket.js',
  trailing: 'ix-trailing-stop-ticket.js'
};

/** Extra option helpers on the option-place door — files must exist. */
var EXTRA_HELPERS = [
  'ix-option-amend-price-ticket.js',
  'ix-option-amend-qty-ticket.js',
  'ix-option-cancel-ticket.js',
  'ix-option-cover-ticket.js',
  'ix-option-exercise-ticket.js',
  'ix-option-expire-ticket.js',
  'ix-option-replace-ticket.js',
  'ix-option-take-ticket.js'
];

var REQUIRED_DOORS = [
  'iceberg',
  'peg',
  'close',
  'bracket',
  'oco',
  'post-only',
  'reduce-only',
  'fok',
  'ioc',
  'trailing',
  'stop-limit'
];

function listTs(dir) {
  return fs
    .readdirSync(dir)
    .filter(function (name) {
      return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts');
    })
    .sort();
}

function readIf(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function classifyEngine(src) {
  if (!src) return 'ABSENT';
  var liveBind =
    /export function (pegPrice|visibleRemaining|bindPegRelative|refillDisplay|readMin|readMax)\b/.test(src) ||
    /export function \w+Refuse\b/.test(src) === false;
  var unsupported = /\bare unsupported\b/.test(src) || /_UNSUPPORTED/.test(src);
  if (unsupported && !/export function (pegPrice|visibleRemaining|bindPegRelative|readMin|refillDisplay)\b/.test(src)) {
    return 'REFUSE';
  }
  return liveBind || !unsupported ? 'LIVE' : 'REFUSE';
}

function classifyTrade(src) {
  if (!src) return 'ABSENT';
  if (/\bUnsupported intent refuses\b/.test(src) && /_UNSUPPORTED/.test(src)) return 'REFUSE';
  return 'LIVE';
}

function classifyHelper(src) {
  if (!src) return 'MISSING';
  if (
    /Unsupported intent refuses/.test(src) &&
    /refuse\('trade\.\w+_unsupported'/.test(src)
  ) {
    return 'REFUSE';
  }
  if (/if \(readTicket\w+\(input\)\) \{\s*refuse\('trade\.\w+_unsupported'/.test(src)) {
    return 'REFUSE';
  }
  return 'LIVE';
}

function stem(name) {
  return name.replace(/\.ts$/, '');
}

var rows = Object.create(null);

function row(id) {
  if (!rows[id]) {
    rows[id] = {
      id: id,
      matching: 'ABSENT',
      matchingFiles: [],
      trade: 'ABSENT',
      tradeFiles: [],
      helperFile: HELPER_FILE[id] || 'ix-' + id + '-ticket.js',
      helper: 'MISSING',
      helperSrc: null
    };
  }
  return rows[id];
}

function stronger(a, b) {
  var rank = { ABSENT: 0, REFUSE: 1, LIVE: 2, MISSING: 0 };
  return (rank[a] || 0) >= (rank[b] || 0) ? a : b;
}

listTs(ENGINE_DIR).forEach(function (file) {
  var id = stem(file);
  if (SKIP_ENGINE[id]) return;
  var door = ENGINE_DOOR[id] || id;
  var r = row(door);
  var src = fs.readFileSync(path.join(ENGINE_DIR, file), 'utf8');
  r.matching = stronger(classifyEngine(src), r.matching);
  r.matchingFiles.push(file);
});

listTs(TRADE_DIR).forEach(function (file) {
  var id = stem(file);
  if (SKIP_TRADE[id]) return;
  var door = TRADE_DOOR[id];
  if (!door) {
    if (/-place$/.test(id) || id === 'close-position' || id === 'matching-close' || id === 'oco-cancel') {
      door = id.replace(/-place$/, '');
    } else {
      return;
    }
  }
  var r = row(door);
  var src = fs.readFileSync(path.join(TRADE_DIR, file), 'utf8');
  r.trade = stronger(classifyTrade(src), r.trade);
  r.tradeFiles.push(file);
});

Object.keys(HELPER_FILE).forEach(function (id) {
  row(id);
});

var helperFiles = fs.readdirSync(HERE).filter(function (name) {
  return /^ix-.*-ticket\.js$/.test(name) && !name.endsWith('.golden.js');
});

var extraSet = {};
EXTRA_HELPERS.forEach(function (name) {
  extraSet[name] = true;
});

helperFiles.forEach(function (name) {
  if (extraSet[name]) return;
  var src = fs.readFileSync(path.join(HERE, name), 'utf8');
  var mapped = null;
  Object.keys(HELPER_FILE).forEach(function (id) {
    if (HELPER_FILE[id] === name) mapped = id;
  });
  if (!mapped) {
    mapped = name.replace(/^ix-/, '').replace(/-ticket\.js$/, '');
    row(mapped);
  }
  var r = row(mapped);
  r.helperFile = name;
  r.helperSrc = src;
  r.helper = classifyHelper(src);
});

Object.keys(rows).forEach(function (id) {
  var r = rows[id];
  var hp = path.join(HERE, r.helperFile);
  if (!r.helperSrc) {
    if (fs.existsSync(hp)) {
      r.helperSrc = fs.readFileSync(hp, 'utf8');
      r.helper = classifyHelper(r.helperSrc);
    } else {
      r.helper = 'MISSING';
    }
  }
});

var vue = readIf(VUE) || '';
var typeStrip = [];
vue.replace(/setOrderType\('([^']+)'\)/g, function (_, t) {
  if (typeStrip.indexOf(t) === -1) typeStrip.push(t);
  return _;
});

var TYPE_STRIP_MARK = {
  iceberg: 'iceberg',
  peg: 'peg',
  close: 'close',
  bracket: 'bracket',
  oco: 'oco',
  'post-only': 'PO',
  'reduce-only': 'reduceOnly',
  fok: 'FOK',
  ioc: 'IOC',
  trailing: 'trailing_stop',
  'stop-limit': 'stop_limit',
  collar: 'collar',
  aon: 'aon',
  auction: 'auction',
  gtd: 'GTD'
};

function pad(s, n) {
  s = String(s);
  if (s.length >= n) return s.slice(0, n);
  return s + new Array(n - s.length + 1).join(' ');
}

var ids = Object.keys(rows).sort();
var missingLive = [];
var refuseHelpers = [];
var liveHelpers = [];
var vueRefuseHoles = [];
var vueLiveHoles = [];

console.log(
  pad('DOOR', 22) +
    pad('MATCHING', 10) +
    pad('TRADE', 10) +
    pad('HELPER', 10) +
    'FILE'
);
console.log(new Array(96).join('-'));

ids.forEach(function (id) {
  var r = rows[id];
  var liveDoor = r.matching === 'LIVE' || r.trade === 'LIVE';
  if (r.helper === 'MISSING' && liveDoor) missingLive.push(id);
  if (r.helper === 'REFUSE') refuseHelpers.push(id);
  if (r.helper === 'LIVE') liveHelpers.push(id);
  var mark = TYPE_STRIP_MARK[id];
  var onStrip =
    (mark && typeStrip.indexOf(mark) !== -1) ||
    (mark && vue.indexOf("setOrderType('" + mark + "')") !== -1) ||
    (mark === 'FOK' && /option value="FOK"/.test(vue)) ||
    (mark === 'IOC' && /option value="IOC"/.test(vue)) ||
    (mark === 'PO' && /option value="PO"/.test(vue)) ||
    (mark === 'GTD' && /option value="GTD"/.test(vue)) ||
    (mark === 'reduceOnly' && /reduceOnly/.test(vue));
  if (liveDoor && r.helper === 'REFUSE' && mark && !onStrip) vueRefuseHoles.push(id);
  if (liveDoor && r.helper === 'LIVE' && mark && !onStrip) vueLiveHoles.push(id);
  console.log(
    pad(id, 22) +
      pad(r.matching, 10) +
      pad(r.trade, 10) +
      pad(r.helper, 10) +
      r.helperFile
  );
});

var missingRequired = REQUIRED_DOORS.filter(function (id) {
  return !rows[id] || rows[id].helper === 'MISSING';
});

var missingExtra = EXTRA_HELPERS.filter(function (name) {
  return !fs.existsSync(path.join(HERE, name));
});

var missingInventory = helperFiles.length;

console.log('');
console.log('helpers on disk: ' + missingInventory);
console.log('option extra helpers: ' + EXTRA_HELPERS.join(', '));
console.log(
  'REFUSE helpers: ' + (refuseHelpers.length ? refuseHelpers.join(', ') : '(none)')
);
console.log('LIVE helpers: ' + liveHelpers.join(', '));
console.log('Vue type strip: ' + (typeStrip.join(', ') || '(none)'));
console.log(
  'Vue type-strip holes (REFUSE helper, expected until LOOK): ' +
    (vueRefuseHoles.length ? vueRefuseHoles.join(', ') : '(none)')
);
console.log(
  'Vue type-strip holes (LIVE helper, fail until Codex LOOK): ' +
    (vueLiveHoles.length ? vueLiveHoles.join(', ') : '(none)')
);
console.log(
  'MISSING live doors: ' + (missingLive.length ? missingLive.join(', ') : '(none)')
);

if (missingExtra.length) {
  console.error('missing extra option helpers: ' + missingExtra.join(', '));
}
if (missingRequired.length) {
  console.error('missing required doors/helpers: ' + missingRequired.join(', '));
}
if (missingLive.length) {
  console.error(
    'live matching/trade door has no ticket helper: ' + missingLive.join(', ')
  );
}
if (vueLiveHoles.length) {
  console.error(
    'live ticket door has no Vue type-strip control (Codex LOOK): ' +
      vueLiveHoles.join(', ')
  );
}

if (missingInventory < 1) {
  throw new Error('no ix-*-ticket.js helpers found');
}

if (
  missingExtra.length ||
  missingRequired.length ||
  missingLive.length ||
  vueLiveHoles.length
) {
  process.exit(1);
}

console.log('ix-ticket-capability-matrix golden: PASS');
