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

test('chart reprice stages exact ticks and never submits on pointer release', async ({ page }) => {
  const consequentialWrites = [];
  let openOrder = {
    id: 'order-reprice-1',
    clientOrderId: 'client-reprice-1',
    timestamp: 1788300000000,
    symbol: 'BTC/USDT',
    type: 'limit',
    side: 'buy',
    timeInForce: 'GTC',
    postOnly: false,
    price: '100.00',
    amount: '2.0000',
    filled: '0',
    remaining: '2.0000',
    cost: '0',
    status: 'open',
  };

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (/\/orders\/order-reprice-1(?:\/replace)?$/.test(path) && (method === 'PATCH' || method === 'POST')) {
      consequentialWrites.push({ method, path });
    }

    let body;
    if (path === '/api/v1/markets') body = [market];
    else if (path === '/api/v1/tickers') body = { 'BTC/USDT': { last: '100.00', percentage: null } };
    else if (path.startsWith('/api/v1/ohlcv/')) {
      body = [
        [1788300000000, '99.00', '101.00', '98.50', '100.00', '5'],
        [1788300060000, '100.00', '101.50', '99.50', '100.50', '4'],
      ];
    } else if (path.startsWith('/api/v1/orderbook/')) body = { symbol: 'BTC/USDT', bids: [], asks: [] };
    else if (path.startsWith('/api/v1/trades/')) body = [];
    else if (path === '/api/v1/account/balance') {
      body = {
        timestamp: 1788300060000,
        balances: {
          BTC: { free: '2.0000', used: '0', total: '2.0000' },
          USDT: { free: '1000.00', used: '0', total: '1000.00' },
        },
      };
    } else if (path === '/api/v1/orders/open') body = [openOrder];
    else if (path === '/api/v1/orders/closed' || path === '/api/v1/account/trades') body = [];
    else {
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'NotSupported', message: 'not in reprice fixture' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/exchange/btc_usdt', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('.ix-terminal').waitFor({ state: 'attached' });
  await page.evaluate(() => {
    const exchange = document.querySelector('.ix-terminal').__vue__;
    exchange.$store.commit('setIxSession', {
      accessToken: 'uiproof-memory-only-session',
      expiresAt: '2026-09-02T23:59:59.000Z',
    });
    exchange.$store.commit('setMember', { id: 'user-reprice', username: 'reprice-proof' });
  });

  await page.getByRole('button', { name: /Open Orders/i }).click();
  await page.getByRole('button', { name: /^Amend$/i }).click();
  const stage = page.locator('.ix-chart-reprice-stage');
  await expect(stage).toBeVisible();
  await expect(stage).toContainText('100.00');

  await page.getByRole('button', { name: 'Raise one tick' }).click();
  await expect(stage).toContainText('100.01');
  const proposed = stage.locator('dd').nth(3);
  await expect(proposed).toContainText('100.01');
  expect(consequentialWrites).toEqual([]);

  const chart = page.locator('#ix_kline');
  await expect(chart).toHaveAttribute('tabindex', '0');
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  const stagedLineCoordinate = await page.evaluate(() => {
    const exchange = document.querySelector('.ix-terminal').__vue__;
    return exchange.klineChart._series.priceToCoordinate(100.01);
  });
  expect(stagedLineCoordinate).not.toBeNull();
  const lineY = box.y + stagedLineCoordinate;
  await page.mouse.move(box.x + box.width * 0.5, lineY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, lineY - 24, { steps: 4 });
  await page.mouse.up();
  await expect(proposed, 'pointer drag must update the staged price').not.toContainText('100.01');
  expect(consequentialWrites, 'pointer release must not call amend or replace').toEqual([]);

  openOrder = { ...openOrder, filled: '0.1000', remaining: '1.9000' };
  await page.evaluate(() => {
    const exchange = document.querySelector('.ix-terminal').__vue__;
    exchange.loadAccount();
  });
  await expect(stage).toBeHidden();
  await expect(page.locator('body')).toContainText('Staged reprice cleared');
});
