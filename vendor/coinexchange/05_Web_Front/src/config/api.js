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
        announcement: '/uc/announcement/page', //announcement list
        paydividends: "/uc/bonus/user/page", //holder dividends
        mylistrecord: "/uc/mine/detail/", //trading-mining detail
        activitylist: "/uc/activity/page-query", // activity list
        memberactivity: "/uc/activity/getmemberrecords", // user activity list
        attendActivity: "/uc/activity/attend", // join activity
        mypromotion: "/uc/promotion/mypromotion", // my referral commission
        toppromotion: "/uc/promotion/toprank", // Partner Leaderboard
        getfreecard: "/uc/promotion/promotioncard/getfreecard", // claim free promo card
        exchangecard: "/uc/promotion/promotioncard/exchangecard", // Redeem promo card
        mycardlist: "/uc/promotion/promotioncard/mycard", // Redeem promo card
        toppromotionmonth: "/uc/promotion/monthtoprank", // Partner Leaderboard
        toppromotionweek: "/uc/promotion/weektoprank", // Partner Leaderboard
        memberInfo: "/uc/member/my-info", // fetch user info
        mypromotionrecord: "/uc/promotion/record", //fetch referral records
        myInnovationOrderList: "/uc/activity/getmyorders", // launchpad order list
        myInnovationMinings: "/uc/miningorder/my-minings" // fetch my miners
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
