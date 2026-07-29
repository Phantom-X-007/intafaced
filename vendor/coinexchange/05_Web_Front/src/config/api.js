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
    market: { //spot market endpoints
        ws: '/market/market-ws',
        thumb: '/market/symbol-thumb',
        thumbTrend: '/market/symbol-thumb-trend',
        plate: '/market/exchange-plate', //order-book snapshot
        platemini: '/market/exchange-plate-mini', //10 levels
        platefull: '/market/exchange-plate-full', //all levels
        trade: '/market/latest-trade', //recent-trades snapshot
        symbolInfo: '/market/symbol-info',
        coinInfo: '/market/coin-info',
        indexData: "/market/index_info"
    },
    exchange: { //spot order endpoints
        orderAdd: '/exchange/order/add', //place order
        current: '/exchange/order/current', //open orders
        history: '/exchange/order/history', //order history
        detail: '/exchange/order/detail/', //order detail
        favorFind: '/exchange/favor/find', //list favourites
        favorAdd: '/exchange/favor/add', //add favourite
        favorDelete: '/exchange/favor/delete', //remove favourite
        orderCancel: '/exchange/order/cancel' //cancel order
    },
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
