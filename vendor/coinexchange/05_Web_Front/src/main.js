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
Vue.prototype.host = "";

// Absolute public origin of the site itself, not the API. It is used only to
// build shareable links and QR codes (announcements, help pages, activity
// details), which have to resolve from a phone camera, so a relative path
// would be wrong here.
Vue.prototype.rootHost = process.env.SITE_ORIGIN || "http://127.0.0.1:8090";

Vue.prototype.api = Api;
Vue.http.options.credentials = true;
Vue.http.options.emulateJSON = true;
Vue.http.options.headers = {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'Content-Type': 'application/json;charset=utf-8'
};

const router = new VueRouter({
    mode: 'history',
    routes
});

iView.LoadingBar.config({
    color: '#F90',
    failedColor: '#f0ad4e',
    height: 2
});

/**
 * Is there a session that a gated screen could actually use?
 *
 * Two of them exist, and that is not an accident to be tidied away here: the
 * vendored exchange has its own ucenter login (`TOKEN` + `MEMBER` in
 * localStorage, restored into `store.member`) and the INTAFACED platform has an
 * svc-identity session held in memory only, deliberately never on disk. The
 * `/uc` and `/otc` screens below are the vendored ones, so the vendored session
 * is what unlocks them — but a visitor holding only a platform session should
 * not be told to sign in as though they held nothing, so both count.
 *
 * localStorage is read directly rather than through the store because this guard
 * runs on the very first navigation, BEFORE App.vue's `created()` has had a
 * chance to call `recoveryMember` — reading `store.getters.isLogin` alone would
 * bounce every deep link into a signed-in account straight back to /login.
 */
function hasSession() {
    if (store.getters.ixSession) return true;
    try {
        return !!(localStorage.getItem('TOKEN') && localStorage.getItem('MEMBER'));
    } catch (e) {
        // Private mode / storage disabled. Treat as signed out rather than
        // throwing inside a navigation guard, which strands the router.
        return false;
    }
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

    var needsAuth = to.matched.some(function(record) {
        return record.meta && record.meta.requiresAuth;
    });

    if (needsAuth && !hasSession()) {
        iView.LoadingBar.finish();
        next({ path: '/login', query: { redirect: to.fullPath } });
        return;
    }

    next();
});

router.afterEach((to,from,next) => {
    window.scrollTo(0,0);
    iView.LoadingBar.finish();
});

// English is the only locale. The vendor shipped a Chinese default and a
// switcher; both are removed rather than merely defaulted, so no stored
// preference, query param or stray commit can put the product back into
// Chinese in front of a customer.
const i18n = new VueI18n({
    locale: 'en',
    fallbackLocale: 'en',
    messages: {
        'en': require('./assets/lang/en.js')
    }
});

Vue.http.interceptors.push((request, next) => {
    // signed inTOKEN, timessessionStorageTOKEN
    request.headers.set('x-auth-token', localStorage.getItem('TOKEN'));
    next((response) => {
        // signed in:TOKEN
        var xAuthToken = response.headers.get('x-auth-token');
        if (xAuthToken!= null && xAuthToken!= '') {
            localStorage.setItem('TOKEN', xAuthToken);
        }

        if (response.body.code == '4000' || response.body.code == '3000') {
            store.commit('setMember', null);
            router.push('/login');
            return false;
        }
        return response;
    });
});

Vue.config.productionTip = false;

Vue.filter('timeFormat', function(tick) {
    return moment(tick).format("HH:mm:ss");
});

Vue.filter('dateFormat', function(tick) {
    return moment(tick).format("YYYY-MM-DD HH:mm:ss");
});

Vue.filter('toFixed', function(number, scale) {
    return new Number(number).toFixed(scale);
});

Vue.filter('toPercent', function(point) {
    var str = Number(point * 100).toFixed(1);
    str += "%";
    return str;
});

function toFloor(number, scale = 8) {
    if (new Number(number) == 0) {
        return 0;
    }
    var __str = number + "";
    if (__str.indexOf('e') > -1 || __str.indexOf('E') > -1) {
        var __num = new Number(number).toFixed(scale + 1),
            __str = __num + "";
        return __str.substring(0, __str.length - 1);
    } else if (__str.indexOf(".") > -1) {
        if (scale == 0) {
            return __str.substring(0, __str.indexOf("."));
        }
        return __str.substring(0, __str.indexOf(".") + scale + 1);
    } else {
        return __str;
    }
}
Vue.filter('toFloor', (number, scale) => {
    return toFloor(number, scale);
});
Vue.prototype.toFloor = toFloor;

new Vue({
    el: '#app',
    router,
    i18n,
    store,
    template: '<App/>',
    components: { App }
});
