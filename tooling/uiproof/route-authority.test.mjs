import assert from 'node:assert/strict';
import test from 'node:test';
import { MEMBER_ROUTE_AUTHORITY, readMemberRouteAuthority } from './route-authority.mjs';

test('living member router produces unique executable proof cases', () => {
  assert.ok(MEMBER_ROUTE_AUTHORITY.length > 80, 'unexpectedly small router inventory');
  assert.equal(new Set(MEMBER_ROUTE_AUTHORITY.map((route) => route.sourcePath)).size, MEMBER_ROUTE_AUTHORITY.length);
  assert.equal(new Set(MEMBER_ROUTE_AUTHORITY.map((route) => route.id)).size, MEMBER_ROUTE_AUTHORITY.length);
  for (const route of MEMBER_ROUTE_AUTHORITY) {
    assert.ok(route.path.startsWith('/'), `${route.sourcePath} has no executable path`);
    assert.doesNotMatch(route.path, /[:*]/, `${route.sourcePath} lacks a safe proof fixture`);
  }
});

test('nested auth, default children, wildcards, comments, and redirects retain router meaning', () => {
  const fixture = `
    // { path: '/commented-out' }
    export default [
      { path: '/public', component: Public },
      { path: '/old', redirect: '/public' },
      {
        path: '/parent',
        component: Parent,
        children: [
          { path: '', component: Default, meta: { requiresAuth: true } },
          { path: 'open', component: Open },
          { path: 'private/*', component: Private, meta: { requiresAuth: true } }
        ]
      },
      { path: '*', component: NotFound }
    ];
  `;
  const routes = readMemberRouteAuthority(fixture);
  const bySource = new Map(routes.map((route) => [route.sourcePath, route]));

  assert.equal(bySource.has('/commented-out'), false);
  assert.equal(bySource.get('/old').redirect, '/public');
  assert.equal(bySource.get('/parent').expectLoginRedirect, true);
  assert.equal(bySource.get('/parent/open').expectLoginRedirect, false);
  assert.equal(bySource.get('/parent/private/*').expectLoginRedirect, true);
  assert.equal(bySource.get('*').path, '/uiproof-not-found');
});

test('real relative default-child redirect resolves under its parent', () => {
  const otc = MEMBER_ROUTE_AUTHORITY.find((route) => route.sourcePath === '/otc');
  assert.equal(otc.redirect, '/otc/trade/usdt');
  assert.equal(otc.expectLoginRedirect, true);
});
