/** Pass 3 — memory-only svc-identity fixture for Stream A uiproof. */
export const FIXTURE_TOKEN = 'uiproof-pass3-fixture-token';

/** Minimal member shape — enough for isLogin + wallet topic ids. */
export const FIXTURE_MEMBER = {
  id: 'uiproof-pass3-user',
  username: 'uiproof_fixture',
  realName: 'UI Proof Fixture',
  mobilePhone: null,
  email: null,
  memberLevel: 1,
  status: 0,
};

/**
 * Boot the public shell, then establish the same in-memory Vuex session that
 * the real svc-identity login commits. A hard navigation after this call would
 * correctly sign the fixture out; protected destinations must use
 * `navigateAuthed` below.
 * @param {import('@playwright/test').Page} page
 * @param {string} [target]
 */
export async function bootShell(page, target = '/') {
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('.page-view, .page-view2, .page-view3');
    return !!(root && root.__vue__ && root.__vue__.$store && root.__vue__.$root._isMounted);
  });
}

/** Establish the fixture after the destination component has mounted. */
export async function establishAuth(page) {
  await page.evaluate(
    ({ token, member }) => {
      const root = document.querySelector('.page-view, .page-view2, .page-view3');
      root.__vue__.$store.commit('setIxSession', {
        accessToken: token,
        userId: member.id,
      });
      root.__vue__.$store.commit('setMember', member);
    },
    { token: FIXTURE_TOKEN, member: FIXTURE_MEMBER },
  );
}

export async function installAuth(page) {
  await bootShell(page);
  await establishAuth(page);
}

/**
 * Preserve the memory-only authority by navigating through Vue Router rather
 * than issuing a document request.
 * @param {import('@playwright/test').Page} page
 * @param {string} target
 */
export async function navigateAuthed(page, target) {
  await page.evaluate((path) => {
    const root = document.querySelector('.page-view, .page-view2, .page-view3');
    root.__vue__.$router.push(path);
  }, target);
  await page.waitForURL((url) => url.pathname === target, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const boundary = document.querySelector('.ix-route-boundary-host');
    return !boundary || boundary.getAttribute('data-status') === 'ready';
  });
}

/** Keep public market reads deterministic so they cannot retrigger account load. */
async function mockPublicTradeDown(page) {
  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({
        code: 'ExchangeNotAvailable',
        message: 'UI proof public market fixture is unavailable',
      }),
    });
  });
}

/**
 * Wallet + orders both answer with honest empty (reachable, zero balances / no rows).
 * @param {import('@playwright/test').Page} page
 */
export async function mockWalletAndOrdersEmpty(page) {
  await mockPublicTradeDown(page);
  await page.route('**/api/v1/account/balance**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({ timestamp: null, datetime: null, balances: {} }),
    });
  });
  await page.route('**/api/v1/account/trades**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify([]),
    });
  });
  await page.route('**/api/v1/orders/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify([]),
    });
  });
}

/**
 * Wallet + orders do not answer — UI must show unknown, not zero/empty.
 * @param {import('@playwright/test').Page} page
 */
export async function mockWalletAndOrdersDown(page) {
  await mockPublicTradeDown(page);
  await page.route('**/api/v1/account/**', async (route) => {
    await route.abort('failed');
  });
  await page.route('**/api/v1/orders/**', async (route) => {
    await route.abort('failed');
  });
}
