#!/usr/bin/env node
/**
 * Stage the Capacitor wrap of the vendored Vue desk.
 *
 * If the shell webpack dist exists, copy it into www (full WebView wrap).
 * Otherwise keep the committed host page. Native configs must already exist.
 *
 *   pnpm --filter mobile build
 *   node ./scripts/build-wrap.mjs --check
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE_ID = 'app.intafaced.mobile';
const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');
const ROOT = join(MOBILE, '..', '..');
const WWW = join(MOBILE, 'www');
const CONFIG = join(MOBILE, 'capacitor.config.json');
const CHECK_ONLY = process.argv.includes('--check');

function fail(msg) {
  console.error('mobile wrap:', msg);
  process.exit(1);
}

function findShellDist() {
  const vendor = join(ROOT, 'vendor');
  if (!existsSync(vendor)) return null;
  for (const name of readdirSync(vendor)) {
    const dist = join(vendor, name, '05_Web_Front', 'dist');
    if (existsSync(join(dist, 'index.html'))) return dist;
  }
  return null;
}

if (!existsSync(CONFIG)) fail('capacitor.config.json missing');
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
if (config.appId !== BUNDLE_ID) fail(`appId is ${config.appId}, expected ${BUNDLE_ID}`);
if (config.appName !== 'INTAFACED') fail('appName must be INTAFACED — own name, zero attribution');
if (!existsSync(join(MOBILE, 'ios'))) fail('ios config directory missing');
if (!existsSync(join(MOBILE, 'android'))) fail('android config directory missing');

const info = readFileSync(join(MOBILE, 'ios/App/App/Info.plist'), 'utf8');
if (!info.includes(BUNDLE_ID)) fail('ios Info.plist missing bundle id');
const gradle = readFileSync(join(MOBILE, 'android/app/build.gradle'), 'utf8');
if (!gradle.includes(`applicationId "${BUNDLE_ID}"`)) fail('android applicationId missing');

if (CHECK_ONLY) {
  console.log(`mobile wrap check: ${BUNDLE_ID} ios+android ok`);
  process.exit(0);
}

mkdirSync(WWW, { recursive: true });
const dist = findShellDist();
if (dist) {
  cpSync(dist, WWW, { recursive: true });
  console.log('mobile wrap: staged shell dist → www');
} else {
  if (!existsSync(join(WWW, 'index.html'))) fail('www/index.html missing and no shell dist');
  console.log('mobile wrap: no shell dist; www host page stays (sideload / WebView)');
}

console.log(`mobile wrap built: ${BUNDLE_ID}`);
