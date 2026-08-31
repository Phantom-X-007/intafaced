import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEMBER_ROUTE_AUTHORITY } from './route-authority.mjs';

const require = createRequire(import.meta.url);
const semanticsModule = fileURLToPath(
  new URL('../../vendor/upstream-exchange/05_Web_Front/src/config/route-semantics.js', import.meta.url),
);
const appFile = fileURLToPath(new URL('../../vendor/upstream-exchange/05_Web_Front/src/App.vue', import.meta.url));
const { ROUTE_SEMANTICS, semanticsForPath } = require(semanticsModule);

test('every member router record has one explicit meaningful semantic contract', () => {
  const authority = MEMBER_ROUTE_AUTHORITY.map((route) => route.sourcePath).sort();
  const catalog = ROUTE_SEMANTICS.map((route) => route.path).sort();
  assert.deepEqual(catalog, authority);
  assert.equal(new Set(catalog).size, catalog.length, 'semantic route patterns must be unique');
  for (const route of ROUTE_SEMANTICS) {
    assert.ok(route.title.trim().length > 2, `${route.path} has no meaningful title`);
    assert.ok(route.heading.trim().length > 2, `${route.path} has no meaningful heading`);
  }
});

test('dynamic routes resolve before the honest catch-all', () => {
  assert.equal(semanticsForPath('/exchange/btc_usdt').heading, 'Exchange desk');
  assert.equal(semanticsForPath('/exchange/').heading, 'Exchange desk');
  assert.equal(semanticsForPath('/announcement/release-1').heading, 'Announcement');
  assert.equal(semanticsForPath('/otc/trade/usdt').heading, 'Peer-to-peer market');
  assert.equal(semanticsForPath('/definitely-not-a-route').heading, 'Page not found');
});

test('the central shell exposes the keyboard and landmark contract', () => {
  const app = readFileSync(appFile, 'utf8');
  assert.match(app, /href="#route-main"/);
  assert.match(app, /<main id="route-main"[^>]*tabindex="-1"[^>]*aria-labelledby="route-heading"/);
  assert.match(app, /<h1 id="route-heading"[^>]*>\{\{ routeSemantic\.heading \}\}<\/h1>/);
  assert.match(app, /document\.title = semantic\.title \+ " — INTAFACED"/);
});
