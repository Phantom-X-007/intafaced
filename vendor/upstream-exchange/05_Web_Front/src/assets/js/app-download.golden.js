#!/usr/bin/env node
/**
 * Fail-first: /app is a Capacitor wrap of this desk — own bundle id,
 * no vendor APK/QR, no store listing claim.
 *
 * Run from 05_Web_Front: node src/assets/js/app-download.golden.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var BUNDLE_ID = 'app.intafaced.mobile';
var root = path.join(__dirname, '../../');
var repo = path.join(__dirname, '../../../../../../');
var page = fs.readFileSync(path.join(root, 'pages/uc/AppDownload.vue'), 'utf8');
var lang = fs.readFileSync(path.join(root, 'assets/lang/en.js'), 'utf8');
var mobile = path.join(repo, 'apps', 'mobile');

function mustHave(hay, needle, where) {
  if (hay.indexOf(needle) === -1) {
    throw new Error(where + ' must contain ' + needle);
  }
}

function mustNot(hay, needle, where) {
  if (hay.indexOf(needle) !== -1) {
    throw new Error(where + ' must not contain ' + needle);
  }
}

mustHave(page, BUNDLE_ID, 'AppDownload.vue');
mustHave(page, 'apps/mobile', 'AppDownload.vue');
mustNot(page, 'IxSocketPage', 'AppDownload.vue');
mustNot(page, '/static/appdownload', 'AppDownload.vue');
mustNot(page, '.apk', 'AppDownload.vue');
mustNot(page, 'qriously', 'AppDownload.vue');
mustNot(page, 'vue-qart', 'AppDownload.vue');
mustNot(page, 'qrcode', 'AppDownload.vue');
mustNot(page, 'WeChat', 'AppDownload.vue');
mustNot(page, 'appdowncover', 'AppDownload.vue');
mustNot(page, 'download1.png', 'AppDownload.vue');

mustHave(lang, "title: 'Mobile app'", 'en.js uc.app');
mustHave(lang, 'sideload', 'en.js uc.app');
mustNot(lang, '/static/appdownload', 'en.js');

if (!fs.existsSync(path.join(mobile, 'ios'))) {
  throw new Error('apps/mobile/ios missing');
}
if (!fs.existsSync(path.join(mobile, 'android'))) {
  throw new Error('apps/mobile/android missing');
}

var cap = fs.readFileSync(path.join(mobile, 'capacitor.config.json'), 'utf8');
mustHave(cap, BUNDLE_ID, 'capacitor.config.json');
mustHave(cap, '"appName": "INTAFACED"', 'capacitor.config.json');

var plist = fs.readFileSync(path.join(mobile, 'ios/App/App/Info.plist'), 'utf8');
mustHave(plist, BUNDLE_ID, 'Info.plist');

var gradle = fs.readFileSync(path.join(mobile, 'android/app/build.gradle'), 'utf8');
mustHave(gradle, 'applicationId "' + BUNDLE_ID + '"', 'android/app/build.gradle');

console.log('app-download.golden: ok ' + BUNDLE_ID);
