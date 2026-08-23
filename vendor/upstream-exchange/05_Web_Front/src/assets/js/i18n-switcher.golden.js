/**
 * Golden: header language switcher + three distinct vendor catalogues.
 * Run from 05_Web_Front: node src/assets/js/i18n-switcher.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '../../');
var app = fs.readFileSync(path.join(root, 'App.vue'), 'utf8');
var en = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var es = fs.readFileSync(path.join(root, 'assets/lang/es.js'), 'utf8');
var fr = fs.readFileSync(path.join(root, 'assets/lang/fr.js'), 'utf8');
var langDir = path.join(root, 'assets/lang');

function fail(msg) {
  throw new Error(msg);
}

if (app.indexOf('this.$i18n.locale = "en"') !== -1) {
  fail('App.vue must not pin $i18n.locale to en');
}
if (app.indexOf('changeLanguage') === -1) fail('changeLanguage missing');
if (app.indexOf('applyLocale') === -1) fail('applyLocale missing');
if (app.indexOf('hasHealthyCatalog') === -1) fail('hasHealthyCatalog missing');
if (app.indexOf('intafaced.i18n.locale') === -1) fail('must persist locale in localStorage');
if (app.indexOf('registerShippedCatalogs') === -1) fail('registerShippedCatalogs missing');
if (app.indexOf('I18N_FALLBACK') === -1) fail('fallback missing');
if (app.indexOf('ix-lang') === -1) fail('header language control missing');
if (app.indexOf("code: \"zh\"") !== -1 || app.indexOf("code: 'zh'") !== -1) {
  fail('must not offer zh without a file');
}

if (en.indexOf('intafaced.i18n') === -1 && en.indexOf('i18n:') === -1) {
  fail('en.js missing intafaced.i18n.* switcher copy');
}
if (en.indexOf('label:') === -1) fail('en.js missing intafaced.i18n.label');

function bankTitle(src) {
  var block = src.match(/modules\s*:\s*\{[\s\S]*?bank\s*:\s*\{[\s\S]*?title\s*:\s*"([^"]+)"/);
  return block && block[1];
}

var enTitle = bankTitle(en);
var esTitle = bankTitle(es);
var frTitle = bankTitle(fr);
if (!enTitle) fail('en bank title missing');
if (!esTitle) fail('es bank title missing');
if (!frTitle) fail('fr bank title missing');
if (enTitle === esTitle) fail('en/es bank titles must differ');
if (enTitle === frTitle) fail('en/fr bank titles must differ');
if (esTitle === frTitle) fail('es/fr bank titles must differ');
if (enTitle === 'intafaced.modules.bank.title' || esTitle === 'intafaced.modules.bank.title' || frTitle === 'intafaced.modules.bank.title') {
  fail('bank title must not be a raw key');
}

if (fs.existsSync(path.join(langDir, 'zh.js'))) {
  fail('do not restore zh.js');
}

var files = fs.readdirSync(langDir).filter(function (n) { return n.endsWith('.js'); }).sort();
if (files.indexOf('en.js') === -1) fail('en.js missing');
if (files.indexOf('es.js') === -1) fail('es.js missing');
if (files.indexOf('fr.js') === -1) fail('fr.js missing');

if (app.indexOf('footer.gsmc') === -1) {
  /* footer still uses the key — the switcher must not leave locale on a missing catalogue */
}
if (app.indexOf('hasHealthyCatalog') === -1) fail('healthy-catalog guard missing');

console.log('i18n-switcher.golden: ok en=' + enTitle + ' es=' + esTitle + ' fr=' + frTitle);
