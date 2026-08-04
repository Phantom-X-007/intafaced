export default {
    host: 'http://49.234.13.106:8801',
    common: {
        login: '/admin/system/employee/sign/in'
    },
    system: {
        permissionAll: '/admin/system/role/permission/all',
        role: '/admin/system/role/all',
        rolePermission: '/admin/system/role/permission',
        statistics: '/admin/system/statistics/dashboard'
    },
    otc:{
        OtcCoin: '/admin/otc/otc-coin/page-query',
        OtcCoinDetail:'admin/otc/otc-coin/detail',
        update: 'admin/otc/otc-coin/update',
        create: 'admin/otc/otc-coin/create',
        advertise:'admin/otc/advertise/page-query',
        advertiseStatus:'admin/otc/advertise/alter-status',
        order:'admin/otc/order/page-query',
        orderDetail:'admin/otc/order/detail',
        appeal:'admin/otc/appeal/page-query',
        detail:'admin/otc/appeal/detail',
        cancelOrder:'admin/otc/appeal/cancel-order',
        releaseCoin: 'admin/otc/appeal/release-coin',
    }
}
