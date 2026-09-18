#!/usr/bin/env node
/**
 * Responsive market-drawer contract. No browser runner is required.
 * Run from 05_Web_Front:
 *   node src/assets/js/exchange-market-drawer.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/exchange/Exchange.vue'), 'utf8');
var failed = 0;

function assert(condition, name) {
  if (!condition) {
    failed += 1;
    console.error('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

function methodBody(name) {
  var match = page.match(new RegExp(name + '\\([^)]*\\)\\s*\\{'));
  if (!match) return '';
  var start = match.index + match[0].length - 1;
  var depth = 0;
  for (var i = start; i < page.length; i += 1) {
    if (page[i] === '{') depth += 1;
    if (page[i] === '}') {
      depth -= 1;
      if (depth === 0) return page.slice(start, i + 1);
    }
  }
  return '';
}

assert(page.indexOf('ref="marketDrawerTrigger"') >= 0, 'pair trigger can receive restored focus');
assert(page.indexOf('@click="toggleMarkets"') >= 0, 'pair trigger uses drawer lifecycle');
assert(page.indexOf('@keydown.tab="trapMarketDrawerTab"') >= 0, 'compact drawer traps Tab');
assert(page.indexOf('@click="closeMarkets(true)"') >= 0, 'close button restores trigger focus');

var focus = methodBody('focusMarketSearch');
assert(focus.indexOf('this.marketsOpen = true') >= 0, 'opening marks drawer open');
assert(focus.indexOf('el.focus()') >= 0, 'opening focuses search');

var close = methodBody('closeMarkets');
assert(close.indexOf('this.marketsOpen = false') >= 0, 'closing marks drawer closed');
assert(close.indexOf('marketDrawerTrigger') >= 0, 'closing restores pair trigger');

var trap = methodBody('trapMarketDrawerTab');
assert(trap.indexOf('deskA11y.shouldTrapTab') >= 0, 'Tab trap uses tested a11y helper');
assert(trap.indexOf('deskA11y.tabWrapIndex') >= 0, 'Tab wraps at drawer boundaries');

function mediaBlocks(css) {
  var blocks = [];
  var re = /@media[^{]*\{/g;
  var m;
  while ((m = re.exec(css))) {
    var brace = m.index + m[0].length - 1;
    var depth = 0;
    for (var i = brace; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push({ header: m[0].replace(/\s+/g, ' ').trim(), body: css.slice(brace + 1, i) });
          break;
        }
      }
    }
  }
  return blocks;
}

var hideBlocks = 0;
mediaBlocks(page).forEach(function (block) {
  if (!/\.ix-markets\s*\{[^}]*display\s*:\s*none/.test(block.body)) return;
  hideBlocks += 1;
  var hideImportant = /\.ix-markets\s*\{[^}]*display\s*:\s*none\s*!important/.test(block.body);
  var openFlex = /\.ix-markets\.is-open\s*\{[^}]*display\s*:\s*flex/.test(block.body);
  var openImportant = /\.ix-markets\.is-open\s*\{[^}]*display\s*:\s*flex\s*!important/.test(block.body);
  assert(openFlex, 'is-open stays visible in ' + block.header);
  if (hideImportant) {
    assert(openImportant, 'is-open uses !important in ' + block.header);
  }
});
assert(hideBlocks >= 1, 'at least one compact breakpoint hides the market rail');

var openPair = methodBody('openPair');
assert(openPair.indexOf('this.closeMarkets(false)') >= 0, 'pair selection closes without stealing route focus');
assert(openPair.indexOf("name: 'ExchangePair'") >= 0, 'pair selection updates the ExchangePair route');

var spec = fs.readFileSync(
  path.join(__dirname, '../../../../../../tooling/uiproof/drawer.spec.mjs'),
  'utf8'
);
assert(spec.indexOf("name: '390'") >= 0, 'FE-P0-03 browser spec covers 390');
assert(spec.indexOf("name: '768'") >= 0, 'FE-P0-03 browser spec covers 768');
assert(spec.indexOf("name: '1024'") >= 0, 'FE-P0-03 browser spec covers 1024');
assert(spec.indexOf('Escape') >= 0, 'FE-P0-03 browser spec Esc-closes');

if (failed) {
  console.error('\n' + failed + ' market-drawer assertion(s) failed');
  process.exit(1);
}
console.log('\nexchange-market-drawer.golden: all passed');
