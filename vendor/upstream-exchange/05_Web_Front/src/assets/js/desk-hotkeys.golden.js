/**
 * Golden tests for desk-hotkeys.js — no jest required.
 * Run from 05_Web_Front:  node src/assets/js/desk-hotkeys.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var hotkeys = require(path.join(__dirname, 'desk-hotkeys.js'));
var resolve = hotkeys.resolveDeskHotkey;
var isTyping = hotkeys.isTypingTarget;
var exchange = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');

var failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function ev(key, extra) {
  var e = { key: key, altKey: false, ctrlKey: false, metaKey: false, defaultPrevented: false };
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      e[k] = extra[k];
    });
  }
  return e;
}

assert(isTyping('INPUT', false) === true, 'INPUT is typing');
assert(isTyping('DIV', false) === false, 'DIV not typing');
assert(isTyping('DIV', true) === true, 'contentEditable is typing');

assert(resolve(ev('/'), { typing: false }).action === 'focus_market_search', '/ → market search');
assert(resolve(ev('/'), { typing: true }) === null, '/ ignored while typing');
assert(resolve(ev('Escape'), { typing: true }).action === 'escape', 'Esc always');
assert(resolve(ev('b'), { typing: false }).action === 'focus_buy_ticket', 'b → buy ticket');
assert(resolve(ev('S'), { typing: false }).action === 'focus_sell_ticket', 'S → sell ticket');
assert(resolve(ev('t'), { typing: false }).action === 'focus_ticket', 't → focus ticket');
assert(resolve(ev('x'), { typing: false }).action === 'cancel_last_open', 'x → cancel last open');
assert(resolve(ev('x'), { typing: true }) === null, 'x ignored while typing');
assert(resolve(ev('Enter'), { typing: true, fromWindow: true }) === null, 'Enter not from window capture');
assert(
  resolve(ev('Enter'), { typing: true, fromWindow: false }).action === 'submit',
  'Enter in field → submit'
);
assert(resolve(ev('b', { ctrlKey: true }), { typing: false }) === null, 'ctrl+b ignored');
assert(resolve(ev('b', { defaultPrevented: true }), { typing: false }) === null, 'defaultPrevented skipped');

assert(Array.isArray(hotkeys.DESK_HOTKEY_MAP) && hotkeys.DESK_HOTKEY_MAP.length >= 6, 'map documented');
assert(
  hotkeys.DESK_HOTKEY_MAP.some(function (entry) {
    return entry.action === 'command_palette' && entry.keys.join('+') === 'Cmd/Ctrl+K';
  }),
  'global Cmd/Ctrl-K command palette documented on desk map'
);
assert(
  exchange.indexOf('}\n.ix-kbd-hint { display: none; }\n\n@media (min-width: 1510px)') === -1,
  'desktop keyboard map is not suppressed by the scoped cascade'
);
assert(
  exchange.indexOf('.ix-order-note.ix-kbd-hint {\n  display: block;\n  font-size: 11px;') !== -1,
  'desktop keyboard map is visibly rendered at 11px'
);
assert(
  exchange.indexOf('class="ix-study-toggle"') !== -1 &&
    exchange.indexOf("@click=\"toggleIndicator('rsi')\"") < exchange.indexOf('v-for="tf in intervals"'),
  'mobile chart strip leads with real study toggles before timeframes'
);
assert(
  exchange.indexOf('.ix-chart-panel .ix-study-toggle {') !== -1 &&
    exchange.indexOf('aria-label="Toggle MACD study pane"') !== -1,
  'mobile RSI/MACD controls have a visible and named affordance'
);

if (failed) {
  console.error('\n' + failed + ' golden assertion(s) failed');
  process.exit(1);
}
console.log('\ndesk-hotkeys golden: all passed');
process.exit(0);
