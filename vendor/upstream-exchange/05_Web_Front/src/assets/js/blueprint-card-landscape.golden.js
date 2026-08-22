'use strict';
/**
 * Fail-first: /blueprint share card must query both §7.2 canvases.
 * Run from 05_Web_Front: node src/assets/js/blueprint-card-landscape.golden.js
 *
 * Landscape is already compose-ready (1200×630). Tip used to call card with
 * size: 'portrait' only. This golden fails until the page reloads
 * query('blueprint', 'card', { size }) for landscape as well as portrait.
 *
 * Raster unavailable is data (status/code). Never invent a PNG URL.
 */
var fs = require('fs');
var path = require('path');
var page = fs.readFileSync(path.join(__dirname, '../../pages/intafaced/Blueprint.vue'), 'utf8');
var lang = fs.readFileSync(path.join(__dirname, '../lang/en.js'), 'utf8');

function assertContains(value, needle, name) {
  if (value.indexOf(needle) === -1) {
    throw new Error((name || 'missing') + ': ' + needle);
  }
}

assertContains(page, "query('blueprint', 'card'", 'card query');
assertContains(page, "size: 'landscape'", 'landscape canvas');
assertContains(page, "size: 'portrait'", 'portrait canvas');
assertContains(page, 'intafaced.blueprint.cardPortrait', 'portrait label key');
assertContains(page, 'intafaced.blueprint.cardLandscape', 'landscape label key');
assertContains(page, 'card.data.raster.status', 'raster status is data');
assertContains(page, 'card.data.raster.code', 'raster code is data');
assertContains(page, 'safeSvg', 'svg preview from service string');

assertContains(lang, 'cardPortrait:', 'en portrait label');
assertContains(lang, 'cardLandscape:', 'en landscape label');

if (/\bhttps?:\/\/[^\s'"<>]+\.png\b/i.test(page)) {
  throw new Error('invented PNG URL — raster unavailable must stay data');
}
if (/card_asset_url\s*[:=]/.test(page)) {
  throw new Error('must not assign card_asset_url');
}
if (/@click\s*=\s*["'][^"']*(export|erase)/i.test(page)) {
  throw new Error('export/erase are not drawn on this hub');
}

console.log('blueprint-card-landscape.golden: ok');
