import { test, expect } from '@playwright/test';

const market = {
  id: 'market-btc-usdt',
  symbol: 'BTC/USDT',
  base: 'BTC',
  quote: 'USDT',
  active: true,
  maker: '0.001',
  taker: '0.001',
  precision: { price: '0.01', amount: '0.0001' },
  limits: { amount: { min: '0.0001' }, cost: { min: '10' } },
};

const token = (subject) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ sub: subject })}.proof`;
};

test('desk layout survives reload, isolates principals, resets, and refuses corruption', async ({ page }) => {
  await page.addInitScript(() => {
    window.WebSocket = class ProofSocket {
      constructor() {
        setTimeout(() => this.onopen && this.onopen(), 0);
      }
      close() {
        if (this.onclose) this.onclose();
      }
    };
  });

  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/api/v1/markets') body = [market];
    else if (path === '/api/v1/tickers') body = { 'BTC/USDT': { last: '100.00', percentage: null } };
    else if (path.startsWith('/api/v1/ohlcv/')) body = [[1788300060000, '99.00', '101.00', '98.50', '100.00', '5']];
    else if (path.startsWith('/api/v1/orderbook/')) body = { symbol: 'BTC/USDT', bids: [], asks: [] };
    else if (path.startsWith('/api/v1/trades/')) body = [];
    else if (path === '/api/v1/account/balance') body = { timestamp: 1788300060000, balances: {} };
    else if (path === '/api/v1/orders/open' || path === '/api/v1/orders/closed' || path === '/api/v1/account/trades') body = [];
    else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'Unauthorized' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.setViewportSize({ width: 1680, height: 960 });
  await page.goto('/exchange/btc_usdt', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const terminal = page.locator('.ix-terminal');
  await terminal.waitFor({ state: 'attached' });
  const marketsSeparator = page.getByRole('separator', { name: /resize market/i });
  const rsi = page.getByRole('button', { name: 'Toggle RSI study pane' });
  const fiveMinutes = page.getByRole('button', { name: '5m', exact: true });

  await marketsSeparator.focus();
  await page.keyboard.press('Home');
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '160');
  await rsi.click();
  await expect(rsi).toHaveAttribute('aria-pressed', 'false');
  await fiveMinutes.click();
  await expect(fiveMinutes).toHaveClass(/is-active/);
  const guestEnvelope = await page.evaluate(() => JSON.parse(localStorage.getItem('ix.desk.layout.v2:guest')));
  expect(guestEnvelope).toMatchObject({
    version: 2,
    principal: 'guest',
    layout: { interval: '5', panels: { markets: 160 }, indicators: { rsi: false } },
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.ix-terminal').waitFor({ state: 'attached' });
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '160');
  await expect(rsi).toHaveAttribute('aria-pressed', 'false');
  await expect(fiveMinutes).toHaveClass(/is-active/);

  await page.evaluate((accessToken) => {
    document.querySelector('.ix-terminal').__vue__.$store.commit('setIxSession', {
      accessToken,
      expiresAt: '2026-09-02T23:59:59.000Z',
    });
  }, token('alice'));
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '208');
  await expect(rsi).toHaveAttribute('aria-pressed', 'true');
  await marketsSeparator.focus();
  await page.keyboard.press('End');
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '320');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ix.desk.layout.v2:p-alice')).layout.panels.markets))
    .toBe(320);

  await page.evaluate((accessToken) => {
    document.querySelector('.ix-terminal').__vue__.$store.commit('setIxSession', {
      accessToken,
      expiresAt: '2026-09-02T23:59:59.000Z',
    });
  }, token('bob'));
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '208');
  expect(await page.evaluate(() => localStorage.getItem('ix.desk.layout.v2:p-bob'))).toBeNull();

  await page.evaluate((accessToken) => {
    document.querySelector('.ix-terminal').__vue__.$store.commit('setIxSession', {
      accessToken,
      expiresAt: '2026-09-02T23:59:59.000Z',
    });
  }, token('alice'));
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '320');
  await page.getByRole('button', { name: 'Reset layout' }).click();
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '208');
  await expect(page.locator('.ix-layout-notice')).toContainText('Layout reset to defaults.');
  expect(await page.evaluate(() => localStorage.getItem('ix.desk.layout.v2:p-alice'))).toBeNull();

  await page.evaluate(() => {
    localStorage.setItem('ix.desk.layout.v2:guest', '{broken');
    document.querySelector('.ix-terminal').__vue__.$store.commit('clearIxSession');
  });
  await expect(marketsSeparator).toHaveAttribute('aria-valuenow', '208');
  await expect(page.locator('.ix-layout-notice')).toContainText('Saved layout was invalid and was reset safely.');
  expect(await page.evaluate(() => localStorage.getItem('ix.desk.layout.v2:guest'))).toBeNull();
});
