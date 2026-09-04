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

// Fake WebSocket is a capability test (latest-request-wins), not a STOMP mount.
test('chart becomes live on a real print and resnapshots before reconnect frames', async ({ page }) => {
  let ohlcvRequests = 0;
  let holdOhlcv = false;
  let releaseOhlcv;
  await page.addInitScript(() => {
    const sockets = [];
    class ProofSocket {
      constructor(url) {
        this.url = String(url);
        sockets.push(this);
        setTimeout(() => this.onopen && this.onopen(), 0);
      }
      close() {
        if (this.onclose) this.onclose();
      }
    }
    window.WebSocket = ProofSocket;
    window.__chartProof = {
      tradeSockets: () => sockets.filter((s) => s.url.includes('channel=trades')),
      emitLatest: (value) => {
        const rows = sockets.filter((s) => s.url.includes('channel=trades'));
        const socket = rows[rows.length - 1];
        if (socket && socket.onmessage) socket.onmessage({ data: JSON.stringify(value) });
      },
      closeLatest: () => {
        const rows = sockets.filter((s) => s.url.includes('channel=trades'));
        const socket = rows[rows.length - 1];
        if (socket && socket.onclose) socket.onclose();
      },
    };
  });

  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body;
    if (path === '/api/v1/markets') body = [market];
    else if (path === '/api/v1/tickers') body = { 'BTC/USDT': { last: '100.00', percentage: null } };
    else if (path.startsWith('/api/v1/ohlcv/')) {
      ohlcvRequests += 1;
      if (holdOhlcv)
        await new Promise((resolve) => {
          releaseOhlcv = resolve;
        });
      body = [[1788300060000, '99.00', '101.00', '98.50', '100.00', '5']];
    } else if (path.startsWith('/api/v1/orderbook/')) body = { symbol: 'BTC/USDT', bids: [], asks: [] };
    else if (path.startsWith('/api/v1/trades/')) body = [];
    else {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'Unauthorized' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/exchange/btc_usdt', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.locator('.ix-terminal').waitFor({ state: 'attached' });
  const provenance = page.locator('.ix-chart-provenance');
  await expect(provenance).toContainText('stream listening');

  await page.evaluate(() =>
    window.__chartProof.emitLatest({
      type: 'trade',
      marketId: 'market-btc-usdt',
      sequence: 10,
      price: '9007199254740993.000000000000000001',
      quantity: '0.000000000000000001',
      ts: '2026-09-02T10:02:00.000Z',
      kind: 'unknown',
    }),
  );
  await expect(provenance).toContainText('stream live');
  await expect(page.locator('#ix-chart-summary')).toContainText('close 9007199254740993.000000000000000001');

  const beforeRequests = ohlcvRequests;
  const beforeSockets = await page.evaluate(() => window.__chartProof.tradeSockets().length);
  holdOhlcv = true;
  await page.evaluate(() => window.__chartProof.closeLatest());
  await expect.poll(() => ohlcvRequests).toBe(beforeRequests + 1);
  await expect.poll(() => page.evaluate(() => window.__chartProof.tradeSockets().length)).toBe(beforeSockets + 1);
  await page.evaluate(() =>
    window.__chartProof.emitLatest({
      type: 'trade',
      marketId: 'market-btc-usdt',
      sequence: 11,
      price: '101.25',
      quantity: '0.2',
      ts: '2026-09-02T10:03:00.000Z',
      kind: 'unknown',
    }),
  );
  await page.waitForTimeout(150);
  await expect(page.locator('#ix-chart-summary')).not.toContainText('close 101.25');
  releaseOhlcv();
  await expect(page.locator('#ix-chart-summary')).toContainText('close 101.25', { timeout: 3_000 });
  await expect(provenance).toContainText('stream live');
});
