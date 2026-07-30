/**
 * Pass 3 — logged-in storage fixture for Stream A uiproof.
 *
 * The vendored shell treats `localStorage.TOKEN` + `localStorage.MEMBER` as
 * the ucenter session (see MemberCenter.vue + store.js recoveryMember).
 * We never invent balances: wallet empty vs error come from route fixtures.
 */
export const FIXTURE_TOKEN = 'uiproof-pass3-fixture-token';

/** Minimal member shape — enough for isLogin + wallet topic ids. */
export const FIXTURE_MEMBER = {
  id: 900001,
  username: 'uiproof_fixture',
  realName: 'UI Proof Fixture',
  mobilePhone: null,
  email: null,
  memberLevel: 1,
  status: 0,
};

/**
 * Seed localStorage before any page script runs.
 * @param {import('@playwright/test').Page} page
 */
export async function installAuth(page) {
  await page.addInitScript(
    ({ token, member }) => {
      try {
        localStorage.setItem('TOKEN', token);
        localStorage.setItem('MEMBER', JSON.stringify(member));
      } catch {
        /* private mode etc — tests will fail loudly */
      }
    },
    { token: FIXTURE_TOKEN, member: FIXTURE_MEMBER },
  );
}

/**
 * Keep checkLogin from clearing the fixture member (App.vue).
 * @param {import('@playwright/test').Page} page
 */
export async function mockCheckLoginOk(page) {
  await page.route('**/uc/check/login**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({ code: 0, data: true, message: 'ok' }),
    });
  });
}

/**
 * Wallet + orders both answer with honest empty (reachable, zero balances / no rows).
 * @param {import('@playwright/test').Page} page
 */
export async function mockWalletAndOrdersEmpty(page) {
  await page.route('**/uc/asset/wallet/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({
        code: 0,
        message: 'success',
        data: { balance: 0, frozenBalance: 0, address: null },
      }),
    });
  });
  await page.route('**/exchange/order/current**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({ code: 0, content: [], totalElements: 0 }),
    });
  });
  await page.route('**/exchange/order/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json;charset=UTF-8',
      body: JSON.stringify({ code: 0, content: [], totalElements: 0 }),
    });
  });
}

/**
 * Wallet + orders do not answer — UI must show unknown, not zero/empty.
 * @param {import('@playwright/test').Page} page
 */
export async function mockWalletAndOrdersDown(page) {
  await page.route('**/uc/asset/wallet/**', async (route) => {
    await route.abort('failed');
  });
  await page.route('**/exchange/order/**', async (route) => {
    await route.abort('failed');
  });
}
