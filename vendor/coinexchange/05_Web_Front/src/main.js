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
import util from './assets/js/util.js';
import 'swiper/dist/css/swiper.css';
import './assets/icons/iconfont.css';
// Loaded last so the design layer wins on equal specificity against iView and
// the vendor sheets above it.
import './assets/css/intafaced.css';
import App from './App.vue';
import Api from './config/api';
import $ from '@js/jquery.min.js';
var moment = require('moment');

Vue.use(iView);
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

router.beforeEach((to, from, next) => {
    iView.LoadingBar.start();
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
