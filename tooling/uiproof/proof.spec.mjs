/**
 * Stream A visual gate — five assertions per route × viewport (§2.5).
 * 1. No uncaught page errors (network-shaped backends-down noise allowlisted)
 * 2. No console errors (network failures allowlisted — backends-down fixture)
 * 3. Vue mounted (Vue 2 replaces #app with root .page-view — check either)
 * 4. Brand honesty at runtime (forbidden vendor strings absent from DOM text)
 * 5. Full-page screenshot (deterministic name)
 */
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  ROUTES,
  VIEWPORTS,
  NETWORK_ALLOW_PREFIXES,
  FORBIDDEN_DOM,
  shotName,
} from './matrix.mjs';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();
const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const SHOTS = join(ARTIFACTS, 'shots');
mkdirSync(SHOTS, { recursive: true });

/**
 * Backends-down is the intended Phase-1 fixture. Chrome console often reports
 * "Failed to load resource: … 504" with NO path, so path-prefix matching alone
 * false-fails a healthy shell. Allow pure network/resource failures; still fail
 * on real app/logic console errors.
 */
function isAllowlistedNetworkMessage(text, locationUrl = '') {
  const lower = `${text}\n${locationUrl}`.toLowerCase();
  const looksNetwork =
    lower.includes('failed to load resource') ||
    lower.includes('net::') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('err_connection') ||
    lower.includes('err_failed') ||
    lower.includes('err_name_not_resolved') ||
    lower.includes('err_timed_out') ||
    lower.includes('fetch') ||
    /\b(502|503|504)\b/.test(lower);
  if (!looksNetwork) return false;
  if (NETWORK_ALLOW_PREFIXES.some((p) => lower.includes(p.toLowerCase()))) return true;
  // No path in message — still a network failure under backends-down.
  return (
    lower.includes('failed to load resource') ||
    lower.includes('net::') ||
    lower.includes('err_connection') ||
    lower.includes('err_failed') ||
    lower.includes('err_name_not_resolved') ||
    lower.includes('err_timed_out') ||
    /\b(502|503|504)\b/.test(lower)
  );
}

/** Vue 2 `el: '#app'` *replaces* #app with the root component (`.page-view`). */
function vueMountedPredicate() {
  const app = document.querySelector('#app');
  if (app && app.children && app.children.length > 0) return true;
  const root =
    document.querySelector('.page-view') ||
    document.querySelector('.page-view2') ||
    document.querySelector('.page-view3') ||
    document.querySelector('.page-content') ||
    document.querySelector('.layout');
  return !!(root && (root.children?.length > 0 || (root.innerText || '').trim().length > 0));
}

function isBenignPageError(msg) {
  const s = String(msg || '');
  // Unhandled rejections of fetch Response objects stringify as "Response".
  if (s === 'Response' || s === '[object Response]') return true;
  if (/failed to fetch|networkerror|load failed|net::/i.test(s)) return true;
  return false;
}

for (const route of ROUTES) {
  for (const vp of VIEWPORTS) {
    const title = `${route.id} @ ${vp.name} (${route.path})`;

    test(title, async ({ page }) => {
      const pageErrors = [];
      const consoleErrors = [];

      page.on('pageerror', (err) => {
        const msg = String(err?.message || err);
        if (isBenignPageError(msg)) return;
        pageErrors.push(msg);
      });

      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        const loc = msg.location()?.url || '';
        if (isAllowlistedNetworkMessage(text, loc)) return;
        consoleErrors.push(text);
      });

      await page.setViewportSize({ width: vp.width, height: vp.height });

      const response = await page.goto(route.path, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      // Soft: allow navigation even if proxy returns odd status for deep links
      expect(response, 'navigation response').toBeTruthy();

      // Give Vue a beat to mount and optional redirects to settle.
      await page.waitForTimeout(1500);
      try {
        await page.waitForFunction(vueMountedPredicate, { timeout: 20_000 });
      } catch {
        // fall through — assertion below fails with clear message
      }

      // 3. Vue mounted (post-replace root, not the pre-mount #app placeholder)
      const mount = await page.evaluate(() => {
        const app = document.querySelector('#app');
        const root =
          document.querySelector('.page-view') ||
          document.querySelector('.page-view2') ||
          document.querySelector('.page-view3') ||
          document.querySelector('.page-content') ||
          document.querySelector('.layout');
        return {
          appChildren: app ? app.children.length : -1,
          hasRoot: !!root,
          bodyTextLen: (document.body?.innerText || '').trim().length,
        };
      });
      expect(
        mount.appChildren > 0 || mount.hasRoot,
        `Vue root missing on ${route.path} (appChildren=${mount.appChildren}, hasRoot=${mount.hasRoot}, bodyTextLen=${mount.bodyTextLen})`,
      ).toBeTruthy();

      // B3 / §2.6 — /uc/account must not leave us on the account UI unauthenticated.
      // Guard is API-driven (4000/3000 → /login). Without backends, MemberCenter may
      // still mount; we require either URL ends at /login OR a login form is visible.
      if (route.expectLoginRedirect) {
        const url = page.url();
        const onLogin = /\/login(?:\/|$|\?)/.test(url);
        const loginFormVisible = await page
          .locator('input[type="password"], form.login, .login-form, #loginForm')
          .first()
          .isVisible()
          .catch(() => false);
        // Prefer redirect; accept login surface if SPA rewrote in place.
        expect(
          onLogin || loginFormVisible,
          `auth-gated ${route.path} must redirect to /login or show login form; url=${url}`,
        ).toBeTruthy();
      }

      // 1. page errors
      expect(pageErrors, `pageerror on ${route.path}`).toEqual([]);

      // 2. console errors (non-network)
      expect(consoleErrors, `console error on ${route.path}`).toEqual([]);

      // 4. brand honesty — rendered text + title (not full HTML attributes of scripts)
      const surfaceText = await page.evaluate(() => {
        const title = document.title || '';
        const body = document.body ? document.body.innerText || '' : '';
        return `${title}\n${body}`;
      });
      for (const re of FORBIDDEN_DOM) {
        expect(surfaceText, `forbidden brand ${re} in DOM on ${route.path}`).not.toMatch(re);
      }

      // 5. screenshot
      const file = join(SHOTS, shotName(route.id, vp.name));
      await page.screenshot({ path: file, fullPage: true });
    });
  }
}
