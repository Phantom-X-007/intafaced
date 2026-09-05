// The Vue build version to load with the `import` command
// (runtime-only or standalone) has been set in webpack.base.conf with an alias.
import Vue from 'vue';
import VueClipboard from 'vue-clipboard2';
import routes from './config/routes.js';
import store from './config/store.js';
import VueRouter from 'vue-router';
import vueResource from 'vue-resource';
import VueI18n from 'vue-i18n';
import iView from 'iview';
import 'iview/dist/styles/iview.css';
// iView 3 ships zh-CN as its BUILT-IN default. Every component string the
// app does not override came out Chinese: an empty table read 暫无数据, the
// pager read 共 n 条, Select read 无匹配数据, DatePicker named the months.
// The 977-string purge could not have caught these — they are inside the
// library, not in our templates — which is why they survived it.
import iViewEnUS from 'iview/dist/locale/en-US';
import util from './assets/js/util.js';
import 'swiper/dist/css/swiper.css';
// iconfont removed. The webfont shipped exactly seven glyphs — WeChat, Weibo,
// Biyong, Telegram, Medium, Reddit and an upload arrow — every one of them
// only ever used by the footer social row and the app-download page, both of
// which are gone. Five of the seven are China-only platforms. That is ~200 KB
// of font files across five formats, downloaded on first paint, for nothing.
// Loaded last so the design layer wins on equal specificity against iView and
// the vendor sheets above it.
import './assets/css/intafaced.css';
import App from './App.vue';
import Api from './config/api';
import $ from '@js/jquery.min.js';
var moment = require('moment');
var sessionRevocation = require('./assets/js/session-revocation-channel.js');
var authRefusal = require('./assets/js/auth-refusal.js');
var routeBoundary = require('./assets/js/route-boundary.js');

Vue.use(iView, { locale: iViewEnUS });
Vue.use(VueClipboard);
Vue.use(VueRouter);
Vue.use(vueResource);
Vue.use(VueI18n);

// API base. Empty on purpose: every call site is `this.host + '/uc/...'`,
// `this.host + '/market/...'` and so on, so an empty base makes them
// same-origin relative paths that the dev-server proxy routes to the right
// backend (see config/index.js proxyTable). Nothing about the backend topology
// is baked into the bundle, and the session cookie stays first-party.
//
// For a build served behind its own reverse proxy, leave this empty and route
// /uc, /market, /exchange and /otc there. Only set an absolute origin if the
// API genuinely lives on a different host, and then the backend CORS filters
// have to allow it.
Vue.prototype.host = '';

// Absolute public origin of the site itself, not the API. It is used only to
// build shareable links and QR codes (announcements, help pages, activity
// details), which have to resolve from a phone camera, so a relative path
// would be wrong here.
Vue.prototype.rootHost = process.env.SITE_ORIGIN || 'http://127.0.0.1:8090';

Vue.prototype.api = Api;
Vue.http.options.credentials = true;
Vue.http.options.emulateJSON = true;
Vue.http.options.headers = {
  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  'Content-Type': 'application/json;charset=utf-8',
};

const router = new VueRouter({
  mode: 'history',
  routes,
});

iView.LoadingBar.config({
  color: '#c8c8c8',
  failedColor: '#bdbdbd',
  height: 2,
});

/**
 * Is there a session that a gated screen could actually use?
 *
 * svc-identity is the sole authority. Its bearer lives only in the Vuex store,
 * so a reload is signed out and a TOKEN/MEMBER pair left by an older build is
 * inert. Reading those keys here would let attacker-controlled browser storage
 * paint a protected route before App.vue gets a chance to erase it.
 */
function hasSession() {
  return !!store.getters.ixSession;
}

/**
 * THE AUTH GATE.
 *
 * Before this existed, gating was per-screen and only some screens did it:
 * MemberCenter checked in `created()`, which means it mounted, painted a
 * logged-out member centre, and only then pushed to /login. /chat, /checkuser,
 * /identbusiness and the OTC desk checked nothing at all and simply rendered an
 * empty frame that never filled — the silent failure the brief is about.
 *
 * `to.matched` rather than `to.meta`: meta lives on the record that declared it,
 * and marking the `/uc` parent has to gate all twenty children.
 *
 * `redirect` carries the destination so signing in returns the visitor to what
 * they asked for instead of dumping them on the home page. Login.vue is owned by
 * the auth lane; until it reads this, the parameter is inert but correct, and it
 * is visible in the URL either way.
 */
router.beforeEach((to, from, next) => {
  iView.LoadingBar.start();
  store.commit('routeLoading', routeBoundary.requestedPath(to));

  var needsAuth = to.matched.some(function (record) {
    return record.meta && record.meta.requiresAuth;
  });

  if (needsAuth && !hasSession()) {
    iView.LoadingBar.finish();
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  next();
});

router.afterEach((to, from, next) => {
  window.scrollTo(0, 0);
  iView.LoadingBar.finish();
  store.commit('routeReady', routeBoundary.requestedPath(to));
});

router.onError((error) => {
  iView.LoadingBar.error();
  store.commit('routeFailed', routeBoundary.failure(error, { fullPath: store.state.routeBoundary.path }));
});

// A session is memory-only per tab, but logout/expiry is origin-wide. Carry
// only an invalidation signal between tabs — never the bearer or member data.
var applyingRemoteSessionRevocation = false;
var sessionRevocationChannel = sessionRevocation.createSessionRevocationChannel(typeof window === 'undefined' ? null : window, function () {
  applyingRemoteSessionRevocation = true;
  store.commit('clearIxSession');
  applyingRemoteSessionRevocation = false;

  var current = router.currentRoute;
  var protectedRoute =
    current &&
    current.matched &&
    current.matched.some(function (record) {
      return record.meta && record.meta.requiresAuth;
    });
  if (protectedRoute) {
    router.replace({ path: '/login', query: { redirect: current.fullPath } });
  }
});

store.subscribe(function (mutation) {
  if (mutation.type === 'clearIxSession' && !applyingRemoteSessionRevocation) {
    sessionRevocationChannel.broadcast();
  }
});

/**
 * One refusal path for both platform fetch and legacy vue-resource calls.
 * Clearing ixSession also clears the member projection; exchange watchers then
 * stop every private stream before any stale authenticated chrome can remain.
 * Concurrent 401s are idempotent because only the first sees a live session.
 */
authRefusal.subscribe(function () {
  if (!store.getters.ixSession) return;

  var current = router.currentRoute;
  var protectedRoute =
    current &&
    current.matched &&
    current.matched.some(function (record) {
      return record.meta && record.meta.requiresAuth;
    });
  var redirect = protectedRoute ? current.fullPath : null;

  store.commit('clearIxSession');
  if (redirect) {
    router.replace({ path: '/login', query: { redirect: redirect } });
  }
});

// English is the only locale. The vendor shipped a Chinese default and a
// switcher; both are removed rather than merely defaulted, so no stored
// preference, query param or stray commit can put the product back into
// Chinese in front of a customer.
const i18n = new VueI18n({
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: require('./assets/lang/en.js'),
  },
});

Vue.http.interceptors.push((request, next) => {
  // Legacy vue-resource callers still use x-auth-token, but its only source
  // is the same in-memory svc-identity session used by the route guard. Never
  // attach an empty header and never consult browser storage.
  var token = store.getters.ixToken;
  if (token) request.headers.set('x-auth-token', token);
  next((response) => {
    var code = response.body && response.body.code;
    if (code == '4000' || code == '3000') {
      // An auth refusal invalidates the authority and its member
      // projection together. A response header cannot rotate or create
      // a browser session; only an explicit svc-identity login can.
      authRefusal.signal({ status: response.status || 401, transport: 'vue-resource' });
      return false;
    }
    return response;
  });
});

Vue.config.productionTip = false;

Vue.filter('timeFormat', function (tick) {
  return moment(tick).format('HH:mm:ss');
});

Vue.filter('dateFormat', function (tick) {
  return moment(tick).format('YYYY-MM-DD HH:mm:ss');
});

/* Money display filters (toFixed / toFloor / toPercent) REMOVED.
 * They laundered IEEE floats into painted money. Desk money goes through
 * ix-money / moneyText / decimal() only. Re-adding these filters is a
 * doctrine fail — do not restore.
 */

new Vue({
  el: '#app',
  router,
  i18n,
  store,
  template: '<App/>',
  components: { App },
});
