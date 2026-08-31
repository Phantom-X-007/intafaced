'use strict';

var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '../../');
var main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
var store = fs.readFileSync(path.join(root, 'config/store.js'), 'utf8');
var app = fs.readFileSync(path.join(root, 'App.vue'), 'utf8');
var account = fs.readFileSync(path.join(root, 'components/uc/Account.vue'), 'utf8');
var login = fs.readFileSync(path.join(root, 'pages/uc/Login.vue'), 'utf8');
var register = fs.readFileSync(path.join(root, 'pages/uc/Register.vue'), 'utf8');
var platform = fs.readFileSync(path.join(root, 'pages/intafaced/Platform.vue'), 'utf8');
var authorityFiles = [main, app, account, login, register, platform];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertContains(value, needle, message) {
  assert(value.indexOf(needle) !== -1, message || (needle + ' missing'));
}

authorityFiles.forEach(function (source, index) {
  assert(!/localStorage\.(?:getItem|setItem)\(['"](?:TOKEN|MEMBER)['"]/.test(source),
    'auth file ' + index + ' must not read or write legacy TOKEN/MEMBER');
});

var hasSessionBody = main.slice(main.indexOf('function hasSession()'), main.indexOf('/**\n * THE AUTH GATE'));
assertContains(hasSessionBody, 'return !!store.getters.ixSession', 'guard must use in-memory session');
assert(hasSessionBody.indexOf('localStorage') === -1, 'guard must ignore browser storage');

var interceptor = main.slice(main.indexOf('Vue.http.interceptors.push'), main.indexOf('Vue.config.productionTip'));
assertContains(interceptor, 'store.getters.ixToken', 'interceptor must use in-memory token');
assertContains(interceptor, "if (token) request.headers.set('x-auth-token', token)", 'anonymous request must not get auth header');
assertContains(interceptor, "store.commit('clearIxSession')", 'auth refusal must clear whole session');
assert(interceptor.indexOf('localStorage') === -1, 'interceptor must ignore browser storage');
assert(interceptor.indexOf("response.headers.get('x-auth-token')") === -1, 'response header must not create session');

assertContains(store, 'state.member = state.ixSession ? member : null', 'member projection must require session');
assertContains(store, "localStorage.removeItem('MEMBER')", 'boot must erase stale member');
assertContains(store, "localStorage.removeItem('TOKEN')", 'boot must erase stale token');
assertContains(account, "return this.ixToken ? { 'x-auth-token': this.ixToken } : {}", 'upload must use in-memory token');

var logout = app.slice(app.indexOf('logout() {'), app.indexOf('\n    }', app.indexOf('logout() {')) + 6);
assertContains(logout, 'this.$store.commit("clearIxSession")', 'logout must clear local session immediately');
assertContains(logout, 'mutate("identity", "auth.logout"', 'logout must revoke through svc-identity');
assert(logout.indexOf('/uc/loginout') === -1, 'logout must not call legacy ucenter');

[login, register, platform].forEach(function (source, index) {
  assertContains(source, 'setIxSession', 'login door ' + index + ' must establish in-memory session');
  assertContains(source, 'setMember', 'login door ' + index + ' must project member after session');
});

console.log('session-authority.golden: ok');
