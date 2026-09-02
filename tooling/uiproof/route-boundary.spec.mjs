import { test, expect } from '@playwright/test';

test('unknown, loading, and navigation failure are three explicit route states', async ({ page }) => {
  await page.goto('/uiproof-route-that-does-not-exist?source=proof', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await expect(page.getByRole('alert')).toContainText('404');
  await expect(page.locator('.ix-notfound-path')).toContainText('/uiproof-route-that-does-not-exist?source=proof');

  await page.evaluate(() => {
    document.querySelector('.page-view').__vue__.$router.push('/pay?source=proof');
  });
  await expect.poll(() => page.evaluate(() => document.querySelector('.page-view').__vue__.$route.fullPath)).toBe('/pay?source=proof');
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.page-view').__vue__.$store.state.routeBoundary.status))
    .toBe('ready');
  await expect(page.locator('.ix-route-ready')).toBeVisible();

  await page.evaluate(() => document.querySelector('.page-view').__vue__.$store.commit('routeLoading', '/pay?source=proof'));
  const loading = page.locator('.ix-route-boundary:not(.is-failed)');
  await expect(loading).toContainText('Loading page');
  await expect(loading).toContainText('/pay?source=proof');
  await page.evaluate(() => document.querySelector('.page-view').__vue__.$store.commit('routeReady', '/pay?source=proof'));
  await expect(page.locator('.ix-route-ready')).toBeVisible();
  await expect(loading).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.page-view').__vue__.$store.state.routeBoundary.status))
    .toBe('ready');
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    const app = document.querySelector('.page-view').__vue__;
    app.$store.commit('routeFailed', {
      status: 'failed',
      path: '/bank?source=proof',
      code: 'route.chunk_unavailable',
      message: 'The page files could not be loaded. Your current page has not been replaced.',
    });
  });
  await expect
    .poll(() => page.evaluate(() => document.querySelector('.page-view').__vue__.$store.state.routeBoundary.status))
    .toBe('failed');
  const failed = page.locator('.ix-route-boundary.is-failed');
  await expect(failed).toContainText('route.chunk_unavailable');
  await expect(failed).toContainText('Page could not be loaded');
  await expect(failed).toContainText('/bank?source=proof');
  await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(failed.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  await expect(page.locator('.ix-route-ready')).toBeHidden();
});
