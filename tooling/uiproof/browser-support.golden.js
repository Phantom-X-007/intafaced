import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAB_PLAYWRIGHT_PROJECTS,
  NOT_BROWSER_CERTIFICATION,
  POLICY_REFS,
  SUPPORTED_ENGINES,
  isBrowserCertification,
  playwrightProjectsForConfig,
} from './browser-support.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const policySource = readFileSync(join(here, 'browser-support.mjs'), 'utf8');
const configSource = readFileSync(join(here, 'playwright.config.mjs'), 'utf8');
const memberShell = readFileSync(join(root, 'vendor/upstream-exchange/05_Web_Front/index.html'), 'utf8');
const webpackProd = readFileSync(join(root, 'vendor/upstream-exchange/05_Web_Front/build/webpack.prod.conf.js'), 'utf8');

const engineIds = SUPPORTED_ENGINES.map((engine) => engine.id);
assert.deepEqual(engineIds, ['chromium', 'firefox', 'webkit']);
assert.deepEqual(
  SUPPORTED_ENGINES.map((engine) => engine.playwrightProject),
  ['chromium', 'firefox', 'webkit'],
);
assert.ok(POLICY_REFS.includes('remaining-SOT §12.6'));
assert.ok(POLICY_REFS.includes('remaining-SOT §19.7.8'));

assert.deepEqual([...LAB_PLAYWRIGHT_PROJECTS], ['chromium']);
assert.deepEqual(playwrightProjectsForConfig(['chromium', 'firefox', 'webkit']), ['chromium']);
assert.equal(
  playwrightProjectsForConfig(['firefox', 'webkit']).includes('firefox'),
  false,
  'installed Firefox must not silently become a lab project',
);
assert.equal(
  playwrightProjectsForConfig(['firefox', 'webkit']).includes('webkit'),
  false,
  'installed WebKit must not silently become a lab project',
);

assert.equal(isBrowserCertification('chromium'), true);
assert.equal(isBrowserCertification('firefox'), true);
assert.equal(isBrowserCertification('webkit'), true);
assert.equal(isBrowserCertification('WCAG'), false);
assert.equal(isBrowserCertification('Axe'), false);
assert.equal(isBrowserCertification('axe-core'), false);
assert.ok(NOT_BROWSER_CERTIFICATION.includes('WCAG'));
assert.ok(NOT_BROWSER_CERTIFICATION.includes('Axe'));
assert.equal(
  SUPPORTED_ENGINES.some((engine) => /wcag|axe/i.test(engine.id)),
  false,
  'WCAG/Axe must not be listed as supported engines',
);
assert.match(policySource, /not browser certification/i);
assert.doesNotMatch(
  policySource,
  /WCAG[\s/]+Axe (certify|prove|pass) browsers/i,
  'policy must not claim WCAG/Axe as browser certification',
);

assert.match(configSource, /browser-support\.mjs/);
assert.match(configSource, /name: 'chromium'/);
assert.doesNotMatch(configSource, /name:\s*'firefox'|browserName:\s*'firefox'/, 'playwright.config must not enable a firefox project');
assert.doesNotMatch(configSource, /name:\s*'webkit'|browserName:\s*'webkit'/, 'playwright.config must not enable a webkit project');

assert.match(memberShell, /Content-Security-Policy-Report-Only/);
assert.match(memberShell, /default-src 'self'/);
assert.match(memberShell, /object-src 'none'/);
assert.match(memberShell, /base-uri 'none'/);
assert.match(memberShell, /frame-ancestors 'none'/);
assert.doesNotMatch(memberShell, /http-equiv=["']Content-Security-Policy["']/, 'member shell must stay report-only, not enforcing');
const cspContent = memberShell.match(/http-equiv=["']Content-Security-Policy-Report-Only["'][^>]*content=["']([^"']+)["']/i);
assert.ok(cspContent, 'report-only CSP content is present on the member shell');
assert.doesNotMatch(cspContent[1], /unsafe-eval/, 'production CSP must not ship webpack-dev unsafe-eval');
assert.match(webpackProd, /template:\s*'index\.html'/);

console.log('uiproof browser-support: ok');
