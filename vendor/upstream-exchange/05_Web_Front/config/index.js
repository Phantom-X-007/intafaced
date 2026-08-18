'use strict'
// Template version: 1.2.6
// see http://vuejs-templates.github.io/webpack for documentation.

const path = require('path')

// Backend targets for the dev-server proxy.
//
// The app addresses every API as a bare path — `this.host + '/market/...'`,
// `this.host + '/uc/...'` — and `Vue.prototype.host` is now the empty string
// (see src/main.js). So every call leaves the browser same-origin against this
// dev server and is proxied from here. That is what the commented-out block
// this replaces was reaching for; it just had a hardcoded LAN IP in it.
//
// Same-origin also means no CORS preflight and no third-party cookie problem:
// the ucenter session cookie is set on the dev server's own origin, so
// `Vue.http.options.credentials = true` actually carries it.
//
// Defaults are the compose service names, because the dev server runs in the
// `intafaced-vendor-shell` container attached to the `vendor_default` network.
// Override with env vars when running `npm run dev` on the host directly, e.g.
// COINEX_UC_TARGET=http://127.0.0.1:6001.
const backend = {
    uc: process.env.COINEX_UC_TARGET || 'http://coinex-ucenter:6001',
    market: process.env.COINEX_MARKET_TARGET || 'http://coinex-market:6004',
    exchange: process.env.COINEX_EXCHANGE_TARGET || 'http://coinex-exchange-api:6003',
    otc: process.env.COINEX_OTC_TARGET || 'http://coinex-otc:6006',
    // The INTAFACED platform's single front door. `host.docker.internal` rather
    // than a compose service name because this dev server runs in the
    // `intafaced-vendor-shell` container on the default bridge network, while the
    // platform sits on `intafaced_default` — the two cannot resolve each other
    // by name, but the edge publishes 4000 on the host. Running `npm run dev` on
    // the host instead? IX_EDGE_TARGET=http://127.0.0.1:4000.
    edge: process.env.IX_EDGE_TARGET || 'http://host.docker.internal:4000'
}

module.exports = {
    dev: {

        // Paths
        assetsSubDirectory: 'static',
        assetsPublicPath: '/',
        // Each key matches the server.context-path of the service behind it, so
        // no rewrite is needed: /market/symbol-thumb on the dev server is
        // /market/symbol-thumb on the market service.
        proxyTable: {
            // `/uc` is BOTH an API context-path and SPA routes (`/uc/account`,
            // `/uc/*` member center). Same HTML bypass as `/exchange` — without
            // it a hard navigation to /uc/account 504s when ucenter is down
            // (backends-down is the Stream A Phase-1 fixture) and the SPA never
            // mounts, so the auth-redirect proof cannot run.
            '/uc': {
                target: backend.uc,
                changeOrigin: true,
                secure: false,
                bypass: function (req) {
                    const accept = req.headers.accept || '';
                    if (req.method === 'GET' && accept.indexOf('html') !== -1) {
                        return '/index.html';
                    }
                    return null;
                }
            },
            '/market': {
                target: backend.market,
                changeOrigin: true,
                secure: false
            },
            // `/exchange` is the one prefix that is BOTH an API context-path and
            // an SPA route (`/exchange/:pair` is the trading terminal). Without
            // the bypass the proxy claims every one of them, so opening or
            // hard-refreshing http://localhost:8080/exchange/btc_usdt returned
            // the exchange service's 404 JSON — or a 504 when it is down —
            // instead of index.html, and historyApiFallback never saw the
            // request. Navigations ask for HTML; XHR from the app does not.
            '/exchange': {
                target: backend.exchange,
                changeOrigin: true,
                secure: false,
                bypass: function (req) {
                    const accept = req.headers.accept || '';
                    if (req.method === 'GET' && accept.indexOf('html') !== -1) {
                        return '/index.html';
                    }
                    return null;
                }
            },
            '/otc': {
                target: backend.otc,
                changeOrigin: true,
                secure: false
            },
            // ── INTAFACED platform ────────────────────────────────────────────
            // ONE entry, not one per service. svc-edge (§9) is the front door: it
            // owns the route table, exchanges a bearer token for a principal the
            // services will believe, and 404s any prefix it does not recognise
            // instead of forwarding it. A proxy entry per service port would
            // bypass all three, so nothing here knows svc-bank is on 4009 — and
            // nothing under src/ knows there is a port at all.
            '/api': {
                target: backend.edge,
                changeOrigin: true,
                secure: false
            }
        },

        // Various Dev Server settings
        host: 'localhost', // can be overwritten by process.env.HOST
        port: 8080, // can be overwritten by process.env.PORT, if port is in use, a free one will be determined
        // The dev server runs in a container while the source lives on the
        // Windows host. inotify does not cross that bind mount, so with
        // `poll: false` the watcher never fires and every single edit needs a
        // `docker restart` — about ninety seconds each time, and it wipes the
        // other developer's in-progress state if they share the container.
        autoOpenBrowser: false,
        errorOverlay: true,
        notifyOnErrors: true,
        poll: 1000, // https://webpack.js.org/configuration/dev-server/#devserver-watchoptions-

        // Use Eslint Loader?
        // If true, your code will be linted during bundling and
        // linting errors and warnings will be shown in the console.
        useEslint: true,
        // If true, eslint errors and warnings will also be shown in the error overlay
        // in the browser.
        showEslintErrorsInOverlay: false,

        /**
         * Source Maps
         */

        // https://webpack.js.org/configuration/devtool/#development
        devtool: 'eval-source-map',

        // If you have problems debugging vue-files in devtools,
        // set this to false - it *may* help
        // https://vue-loader.vuejs.org/en/options.html#cachebusting
        cacheBusting: true,

        // CSS Sourcemaps off by default because relative paths are "buggy"
        // with this option, according to the CSS-Loader README
        // (https://github.com/webpack/css-loader#sourcemaps)
        // In our experience, they generally work as expected,
        // just be aware of this issue when enabling this option.
        cssSourceMap: false,
    },

    build: {
        // Template for index.html
        index: path.resolve(__dirname, '../dist/index.html'),

        // Paths
        assetsRoot: path.resolve(__dirname, '../dist'),
        assetsSubDirectory: 'assets',

        // '/' AND NOT '/static/'. These two settings have to agree with each
        // other and with how the built `dist` is served, and they did not:
        //
        //   assetsSubDirectory 'assets'  →  files land in  dist/assets/js/…
        //   assetsPublicPath  '/static/' →  index.html asks for /static/assets/js/…
        //
        // nginx serves `dist` at the root, so every script tag 404'd and the
        // app never booted. `curl /` still returned 200 the whole time, because
        // index.html is served no matter what — which is exactly why a build
        // that has never rendered could be declared deployable.
        //
        // With '/' the tags read /assets/js/… and resolve against dist/assets/js/….
        assetsPublicPath: '/',

        /**
         * Source Maps
         */

        productionSourceMap: false,
        // https://webpack.js.org/configuration/devtool/#production
        devtool: '#source-map',

        // Gzip off by default as many popular static hosts such as
        // Surge or Netlify already gzip all static assets for you.
        // Before setting to `true`, make sure to:
        // npm install --save-dev compression-webpack-plugin
        productionGzip: false,
        productionGzipExtensions: ['js', 'css'],

        // Run the build command with an extra argument to
        // View the bundle analyzer report after build finishes:
        // `npm run build --report`
        // Set to `true` or `false` to always turn it on or off
        bundleAnalyzerReport: process.env.npm_config_report
    }
}
