// Local browser proof. All service replies are fixtures; this never submits a live enquiry.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { applyPlaywrightBrowsersEnv } from '../../../../../tooling/uiproof/playwright-browsers.mjs';

const front = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(front, '../../..');
const { executablePath } = applyPlaywrightBrowsersEnv({ repoRoot: root });
const server = createServer(async (request, response) => {
  const requested = new URL(request.url, 'http://localhost').pathname;
  const file = requested.startsWith('/assets/') ? resolve(front, 'dist', '.' + requested) : resolve(front, 'dist/index.html');
  if (!file.startsWith(resolve(front, 'dist') + '/')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(file);
    const type =
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.woff2': 'font/woff2',
      }[extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': type }).end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    let draft,
      firstCapture = true,
      lostAnswer = true;
    const captureRequests = [],
      answerRequests = [];
    await page.route('**/api/ops/trpc/outreach.*', async (route) => {
      const request = route.request();
      const input = request.postDataJSON();
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers().authorization, undefined);
      assert.equal(new URL(request.url()).search, '');
      let data;
      if (request.url().endsWith('.capture')) {
        captureRequests.push(input);
        if (firstCapture) {
          firstCapture = false;
          await route.abort('failed');
          return;
        }
        const now = new Date().toISOString();
        draft = {
          submissionId: randomUUID(),
          revision: 1,
          capturedAt: now,
          continuationExpiresAt: new Date(Date.now() + 3600000).toISOString(),
          contact: input.contact,
          questionnaires: [],
          completedAt: null,
        };
        data = { submissionId: draft.submissionId, revision: 1, capturedAt: now, continuationExpiresAt: draft.continuationExpiresAt };
      } else if (request.url().endsWith('.answer')) {
        answerRequests.push(input);
        assert.equal(input.expectedRevision, draft.revision);
        assert.ok(!draft.questionnaires.some((q) => q.audience === input.questionnaire.audience));
        draft.questionnaires.push(input.questionnaire);
        draft.revision += 1;
        if (draft.questionnaires.length === draft.contact.interests.length) draft.completedAt = new Date().toISOString();
        if (lostAnswer) {
          lostAnswer = false;
          await route.abort('failed');
          return;
        }
        data = draft;
      } else data = draft;
      await route.fulfill({ json: { result: { data } } });
    });
    for (const path of ['/invest', '/trade', '/merchant', '/join/academy', '/join/partner']) {
      await page.goto(origin + path);
      await expect(page.getByRole('heading', { name: 'Where would you like to take part?' })).toBeVisible();
      await expect(page.getByText('INTAFACED · PRELAUNCH')).toBeVisible();
    }
    await page.goto(origin + '/join');
    await page.screenshot({ path: `/tmp/intafaced-outreach-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no mobile horizontal overflow');
    await page.keyboard.press('Tab');
    await expect(page.getByText('Skip to main content', { exact: true })).toBeFocused();
    for (const label of ['Investor', 'Trader', 'Merchant', 'Academy', 'Partner'])
      await page.getByRole('checkbox', { name: new RegExp('^' + label) }).check();
    await page.getByLabel('Your name').fill('Local proof visitor');
    await page.getByLabel('Email', { exact: false }).fill('proof@example.com');
    await page.getByLabel('Organisation').fill('Local proof');
    await page.getByLabel('Country', { exact: false }).selectOption('ID');
    await page.getByRole('button', { name: 'Save contact & continue' }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm');
    await expect(page.getByRole('heading', { name: 'Investor enquiry' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Save contact & continue' }).click();
    await expect(page.getByRole('heading', { name: 'Investor enquiry' })).toBeVisible();
    assert.equal(captureRequests[0].requestId, captureRequests[1].requestId);
    assert.equal(captureRequests[1].contact.marketingOptIn, false);
    await page.getByLabel('Investor type').selectOption('individual');
    await page.getByLabel('How would you like to participate?').selectOption('both');
    await page.getByLabel('Your decision-making role').selectOption('decision_maker');
    await page.getByLabel(/^Status/).selectOption('stated');
    await page.getByLabel('Amount', { exact: true }).fill('9007199254740993.000000000000000001');
    await page.getByLabel('Currency code').fill('USD');
    await page.getByLabel('When would you like to take part?').selectOption('undecided');
    await page.getByRole('button', { name: 'Save investor answers' }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm');
    await page.reload();
    await page.getByRole('button', { name: 'Reopen saved enquiry' }).click();
    await expect(page.getByRole('heading', { name: 'Trader enquiry' })).toBeVisible();
    assert.equal(answerRequests[0].questionnaire.answers.indicativeContribution.amount, '9007199254740993.000000000000000001');
    await page.getByRole('checkbox', { name: 'Spot', exact: true }).check();
    await page.getByLabel('Trading experience').selectOption('advanced');
    await page.getByLabel('Your trading role').selectOption('professional');
    await page.getByLabel('What would you like from a trading platform?').fill('API access');
    await page.getByLabel('When would you like to take part?').selectOption('later');
    await page.getByRole('button', { name: 'Save trader answers' }).click();
    await expect(page.getByRole('heading', { name: 'Merchant enquiry' })).toBeVisible();
    await page.getByLabel('Business name').fill('Example');
    await page.getByLabel('Industry').fill('Retail');
    await page.getByLabel('Operating countries').selectOption(['ID', 'SG']);
    await page.getByRole('checkbox', { name: 'Payment acceptance' }).check();
    await page.getByLabel(/^Status/).selectOption('stated');
    await page.getByLabel('Amount', { exact: true }).fill('0.000000000000000001');
    await page.getByLabel('Currency code').fill('IDR');
    await page.getByLabel('Volume period').selectOption('monthly');
    await page.getByLabel('When would you like to take part?').selectOption('as_available');
    await page.getByRole('button', { name: 'Save merchant answers' }).click();
    await expect(page.getByRole('heading', { name: 'Academy enquiry' })).toBeVisible();
    await page.getByLabel('What would you like to learn?').fill('Markets');
    await page.getByLabel('Current experience').selectOption('beginner');
    await page.getByLabel('Preferred subjects').fill('Risk, Markets');
    await page.getByLabel('Preferred learning format').selectOption('live');
    await page.getByLabel('When would you like to take part?').selectOption('within_three_months');
    await page.getByRole('button', { name: 'Save academy answers' }).click();
    await expect(page.getByRole('heading', { name: 'Partner enquiry' })).toBeVisible();
    await page.getByLabel('Your expertise').fill('Education');
    await page.getByLabel('What would you like to contribute?').fill('A learning community');
    await page.getByLabel('Preferred relationship').selectOption('collaboration');
    await page.getByLabel('When would you like to take part?').selectOption('later');
    await page.getByRole('button', { name: 'Save partner answers' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you. Your selected enquiries are complete.' })).toBeVisible();
    assert.equal(draft.questionnaires.length, 5);
    assert.equal(new Set(draft.questionnaires.map((q) => q.audience)).size, 5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(browserErrors, []);
    await context.close();
    console.log(
      `public intake browser proof: ${width}px all five journeys, lost capture/answer recovery, keyboard skip and overflow passed`,
    );
  }
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
