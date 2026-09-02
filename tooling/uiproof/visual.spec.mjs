/**
 * Pass 4 — stable visual contracts for every materially different shell layout.
 * Tier A proves every route functionally; duplicating 89 near-identical route
 * snapshots would add noise, so the Tier B layout-family authority owns pixels.
 */
import { test, expect } from '@playwright/test';
import { TIER_A_VIEWPORTS, TIER_B_ROUTES } from './matrix.mjs';

for (const route of TIER_B_ROUTES) {
  for (const viewport of TIER_A_VIEWPORTS) {
    test(`${route.layoutFamily} visual @ ${viewport.name}`, async ({ page }) => {
      await page.addInitScript(() => {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
          Object.defineProperty(window.crypto, 'randomUUID', {
            configurable: true,
            value: () => '00000000-0000-4000-8000-000000000000',
          });
        }
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/', {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });

      if (route.path !== '/') {
        await page.evaluate(
          ({ target, authenticated }) => {
            const app = document.querySelector('.page-view').__vue__;
            if (authenticated) {
              app.$store.commit('setIxSession', {
                accessToken: 'uiproof-visual-memory-only',
                userId: 'uiproof-visual-user',
              });
              app.$store.commit('setMember', {
                id: 'uiproof-visual-user',
                username: 'uiproof_visual',
              });
            }
            app.$router.push(target);
          },
          { target: route.path, authenticated: route.expectLoginRedirect },
        );
      }

      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const root = document.querySelector('.page-view, .page-view2, .page-view3');
              const boundary = document.querySelector('.ix-route-boundary-host');
              return {
                mounted: Boolean(root),
                routeStatus: boundary?.getAttribute('data-status') || 'ready',
              };
            }),
          { message: `${route.path} must finish its route transition before visual capture` },
        )
        .toEqual({ mounted: true, routeStatus: 'ready' });

      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('#route-heading')).not.toHaveText('');

      await expect(page).toHaveScreenshot(`${route.layoutFamily}__${viewport.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
        scale: 'css',
      });
    });
  }
}
