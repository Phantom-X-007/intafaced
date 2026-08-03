export default {
    common: {
        area: '/uc/support/country'
    },
    uc: { //account endpoints
        login: '/uc/login',
        register: '/uc/register',
        wallet: '/uc/asset/wallet/',
        captcha: '/uc/start/captcha',
        identification: '/uc/approve/certified/business/status', //Merchant verification
        apply: '/uc/approve/certified/business/apply', //merchant verification application
        announcement: '/uc/announcement/page' //announcement list
        // ── SIXTEEN RETIRED PATHS REMOVED ───────────────────────────────────
        // The promotions, referral, launchpad, gift and dividend endpoints
        // (/uc/bonus/*, /uc/mine/*, /uc/activity/*, /uc/promotion/*,
        // /uc/miningorder/*, /uc/member/my-info) lived here and had no caller
        // left after their screens were socketed or deleted.
        //
        // Deleted rather than commented out, and that is the point of writing
        // it down: a named constant pointing at an unproxied path is an
        // invitation. Anyone adding a screen reads this file, finds
        // `api.uc.mycardlist`, and reasonably concludes there is a card service
        // to call. There is not — nginx proxies only /api/ and /ws, so every one
        // of these returned index.html with a 200 and the caller read HTML as a
        // failed API response.
        //
        // What each screen actually needs instead is stated per screen in
        // ./sockets.js. Anything genuinely behind the front door goes through
        // ./intafaced.js, which is a different transport for a reason.
    },
    // REMOVED: the `market` and `exchange` groups.
    //
    // Every one of them addressed the retired Java market and exchange services
    // (ADR 2026-08-02, Option B). Nothing references them any more: market data
    // comes from `GET /api/v1/markets|tickers|orderbook|trades|ohlcv` and orders
    // from `/api/v1/orders*`, all through svc-edge — see `config/intafaced.js`.
    //
    // They are deleted rather than left as an unused table because a constant
    // named `orderAdd` is an invitation. The next person wiring an order form
    // finds it, uses it, and ships a Buy button that posts into a dead host —
    // which is exactly how these screens came to be pointed at a retired
    // backend in the first place. The remaining groups below are still live for
    // the OTC, CMS and account screens that have not been moved yet.
    otc: {
        coin: '/otc/coin/all', //supported coins
        advertise: '/otc/advertise/page-by-unit', //fetch ads
        createAd: '/uc/ad/create', //create ad
        adDetail: '/otc/advertise/detail'
    },
    activity: {
        activity: "/activity/page-query"
    }
}
