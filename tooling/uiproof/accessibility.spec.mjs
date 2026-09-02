/** Phase 1.5 — WCAG A/AA gate over every materially different layout family. */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TIER_A_VIEWPORTS, TIER_B_ROUTES } from './matrix.mjs';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function describeViolations(violations) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 5)
        .map((node) => `${node.target.join(' ')} — ${node.failureSummary}`)
        .join('\n    ');
      return `${violation.id} (${violation.impact}): ${violation.help}\n    ${nodes}`;
    })
    .join('\n\n');
}

for (const route of TIER_B_ROUTES) {
  for (const viewport of TIER_A_VIEWPORTS) {
    test(`${route.layoutFamily} accessibility @ ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });

      if (route.path !== '/') {
        await page.evaluate(
          ({ target, authenticated }) => {
            const app = document.querySelector('.page-view').__vue__;
            if (authenticated) {
              app.$store.commit('setIxSession', {
                accessToken: 'uiproof-accessibility-memory-only',
                userId: 'uiproof-accessibility-user',
              });
              app.$store.commit('setMember', {
                id: 'uiproof-accessibility-user',
                username: 'uiproof_accessibility',
              });
            }
            app.$router.push(target);
          },
          { target: route.path, authenticated: route.expectLoginRedirect },
        );
      }

      await expect.poll(() => page.locator('.ix-route-boundary-host').getAttribute('data-status')).toBe('ready');
      await expect(page.locator('#route-heading')).not.toHaveText('');

      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(results.violations.length, describeViolations(results.violations)).toBe(0);
    });
  }
}
