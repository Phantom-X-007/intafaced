import { BASEURL, fetch, post, patch, put, postConfig } from './http.js'

export const BASICURL = BASEURL;
// export const uploadPic = data => post('', data);
// export const getALL = () => post();  post
// export const getALL = () => fetch();  get
// post
export const helpDown = data => post('admin/cms/system-help/down', data);
// post
export const manageDown = data => post('admin/system/announcement/down', data);
// post "" => ""
export const getCoinName = () => post('admin/system/coin/all-name-and-unit');
// post "" => "excel"
export const coinOutExcel = () => fetch('admin/otc/order/out-excel');

// GET ""=>"()"
export const withdrawManage = data => fetch('admin/finance/withdraw-record/page-query', data);

// Patch ""=>""   ""
export const auditPass = data => patch('admin/finance/withdraw-record/audit-pass', data);

// Patch ""=>""   ""
export const auditNoPass = data => patch('admin/finance/withdraw-record/audit-no-pass', data);

// POST ""=>""
export const memberDeposit = data => post('admin/finance/member-deposit/page-query', data);

// POST ""=>
export const dashBoardInfo = data => post('admin/system/statistics/dashboard', data);

// GET ""=>""
export const personalTradeInfo = data => fetch(`admin/finance/withdraw-record/${data}`);

// GET ""=>""
export const allTradeInfo = () => post('admin/finance/member-transaction/all');

// GET ""=>""
export const perTradeAll = data => post('admin/finance/member-transaction/page-query', data);

// POST ""
export const MemberRealNameList = data => post('admin/member/member-application/page-query', data);

// POST ""
export const MemberRealNameDetail = data => post('admin/member/member-application/detail', data);

// POST ""
export const memberCheckPass = data => patch(`admin/member/member-application/${data}/pass`);

// POST ""
export const memberCheckNotPass = (url, data) => patch(`admin/member/member-application/${url}/no-pass`, data);

// POST "" => ""
export const manageAd = data => post('admin/cms/system-advertise/page-query', data);

// POST "" => ""
export const createAd = data => post('admin/cms/system-advertise/create', data);

// POST "" => ""
export const deleteAd = data => post('admin/cms/system-advertise/deletes', data);

// Post "" => ""
export const adDetail = data => post('admin/cms/system-advertise/detail', data);

// Post "" => ""
export const updateAd = data => post('admin/cms/system-advertise/update', data);

// Post "" => ""
export const helpManage = data => post('admin/cms/system-help/page-query', data);

// Post "" => ""=>""
export const stickTopHelp = data => post('admin/cms/system-help/top', data);

// Post "" => ""
export const addHelpManage = data => post('admin/cms/system-help/create', data);

// Post "" => ""
export const delHelpManage = data => post('admin/cms/system-help/deletes', data);

// Post "" => ""
export const helpManageDetail = data => post('admin/cms/system-help/detail', data);

// Post "" => ""
export const updateHelpManage = data => post('admin/cms/system-help/update', data);

// Post "" => ""=>""
export const stickTopAnnounce = data => post('admin/system/announcement/top', data);

// Post "" => ""
export const memberManage = data => post('admin/member/page-query', data);

// Post "" => ""
export const memberDetail = data => post('admin/member/detail', data);

// GET "" => ""
export const announceManage = data => fetch('admin/system/announcement/page-query', data);

// Post "" => ""
export const addAnnounce = data => post('admin/system/announcement/create', data);

// Post "" => ""
export const delAnnounce = data => patch('admin/system/announcement/deletes', data);

// GET "" => ""
export const announceDetail = parma => fetch(`admin/system/announcement/${parma}/detail`);

// Put "" => ""
export const updateAnnounce = (urlID, data) => put(`admin/system/announcement/${urlID}/update`, data);

// Post "" => ""=>""
export const stickTopAdv = data => post('admin/cms/system-advertise/top', data);

// POST "" => ""
export const roleManage = () => post('admin/system/role/all');

// POST "" => ""->""
export const queryRolePermission = data => post('admin/system/role/permission', data);

// POST "" => ""->""
export const addAuditRole = data => post('admin/system/role/merge', data);

// POST "" => ""->""
export const deleteRole = data => post('admin/system/role/deletes', data);

// POST "" => ""=>""
export const departmentManage = () => post('admin/system/department/all');

// POST "" => ""->""
export const addAuditDepart = data => post('admin/system/department/merge', data);

// POST "" => ""->""
export const departDetail = data => post('admin/system/department/detail', data);

// POST "" => ""->""
export const delDepart = data => post('admin/system/department/deletes', data);

// POST ""
export const getAllPermission = () => post('admin/system/role/permission/all');

// POST "" => ""
export const permissionManage = data => post('admin/system/permission/page-query', data);

// POST "" => ""
export const addAuditPermission = data => post('admin/system/permission/merge', data);

// POST "" => ""
export const delPermission = data => post('admin/system/permission/deletes', data);

// GET "" => ""
export const businessAudit = (parma, data) => patch(`admin/member/${parma}/audit-business`, data);

// GET "" => ""=>""
export const businessDetail = (url, data) => fetch(`admin/member/${url}/business-auth-detail`, data);

// POST "" => ""->""
export const delOtcCoin = data => post('admin/otc/otc-coin/deletes', data);

// POST "" => ""
export const queryOtcAdv = data => post('admin/otc/advertise/page-query', data);

// POST "" => ""=>"/"
export const upDownAdv = data => post('admin/otc/advertise/alter-status', data);

// POST "" => ""
export const queryAppeal = data => post('admin/otc/appeal/page-query', data);

// POST "" => ""=> ""
export const releaseAppealCoin = data => post('admin/otc/appeal/release-coin', data);

// POST "" => ""=> ""
export const cancelAppealOrder = data => post('admin/otc/appeal/cancel-order', data);

// POST "" => ""=> ""
export const queryOtcOrder = data => post('admin/otc/order/page-query', data);

// POST "" => ""
export const queryOtcCoin = data => post('admin/otc/otc-coin/page-query', data);

// POST "" => ""=>""
export const addOtcCoin = data => post('admin/otc/otc-coin/create', data);

// POST "" => ""=>""
export const updateOtcCoin = data => post('admin/otc/otc-coin/update', data);

// GET "" => ""
export const rechargeOtcCoin = data => fetch('admin/legal-wallet-recharge/page', data);

// GET "" => ""=>""
export const otcCoinDetail = (url, data) => fetch(`admin/legal-wallet-recharge/${url}`, data);

// GET "" => ""=>""
export const rechargeOtcCoinPass = (url, data) => patch(`admin/legal-wallet-recharge/${url}/pass`, data);

// GET "" => ""=>""
export const rechargeOtcCoinNoPass = (url, data) => patch(`admin/legal-wallet-recharge/${url}/no-pass`, data);

// POST "" => ""=>""
export const legalOtcCoin = () => post('admin/system/coin/all-name/legal');

// GET "" => ""
export const withdrawOtcCoin = data => fetch('admin/legal-wallet-withdraw/page', data);

// GET "" => ""=>""
export const withdrawOtcCoinDetail = (url, data) => fetch(`admin/legal-wallet-withdraw/${url}`, data);

// GET "" => ""=>""
export const withdrawOtcCoinPass = (url, data) => patch(`admin/legal-wallet-withdraw/${url}/pass`, data);

// GET "" => ""=>""
export const withdrawOtcCoinNoPass = (url, data) => patch(`admin/legal-wallet-withdraw/${url}/no-pass`, data);

// GET "" => ""=>""
export const withdrawOtcCoinRemit = (url, data) => patch(`admin/legal-wallet-withdraw/${url}/remit`, data);

// POST "" => ""->""
export const exgOrderDetail = data => post('admin/exchange/exchange-order/detail', data);

// POST "" => ""->""
export const delBBSetting = data => post('admin/exchange/exchange-coin/deletes', data);

// POST "" => ""
export const queryBBSetting = data => post('admin/exchange/exchange-coin/page-query', data);

// POST "" => ""=>""
export const addBBSetting = data => post('admin/exchange/exchange-coin/merge', data);

// POST "" => ""=>""
export const fixBBSetting = data => post('admin/exchange/exchange-coin/alter-rate', data);

// POST "" => ""=>""
export const startBBTrader = data => post('admin/exchange/exchange-coin/start-trader', data);

// POST "" => ""=>""
export const stopBBTrader = data => post('admin/exchange/exchange-coin/stop-trader', data);

// POST "" => ""=>""
export const getRobotConfig = data => post('admin/exchange/exchange-coin/robot-config', data);

// POST "" => ""=>""
export const setRobotConfig = data => post('admin/exchange/exchange-coin/alter-robot-config', data);
// POST "" => ""=>""
export const createRobotConfig = data => post('admin/exchange/exchange-coin/create-robot-config', data);

// POST "" => ""=>""
export const setPriceRobotConfig = data => post('admin/exchange/exchange-coin/alter-robot-config-price', data);
// POST "" => ""=>""
export const createPriceRobotConfig = data => post('admin/exchange/exchange-coin/create-robot-config-price', data);

// POST "" => ""=>""
export const cancelBBAllOrders = data => post('admin/exchange/exchange-coin/cancel-all-order', data);

// POST "" => ""=>""
export const overviewBB = data => post('admin/exchange/exchange-coin/exchange-overview', data);

// POST "" => ""
export const queryBBOrder = data => post('admin/exchange/exchange-order/page-query', data);

// POST "" => ""
export const memberAsset = data => post('admin/member/member-wallet/balance', data);

// patch "" => ""
export const passCoin = data => patch('admin/finance/withdraw-record/remittance', data);

// patch "" => ""
export const passCoinByOne = data => patch('admin/finance/withdraw-record/add-transaction-number', data);

// post "" => ""
export const queryEmployee = data => post('admin/system/employee/page-query', data);

// post "" => ""
export const addAuditEmployee = data => post('admin/system/employee/merge', data);

// post "" => ""
export const employeeDetail = data => post('admin/system/employee/detail', data);

// post "" => ""
export const delEmployee = data => post('admin/system/employee/deletes', data);

// post "" => ""
// export const queryOtc = data => post('admin/otc/order/page-query', data);

// post "" => ""=>""
export const manualPay = data => post('admin/member/member-wallet/recharge', data);

// post "" => ""=>"dashboard"
export const orderNum = () => post('admin/otc/order/get-order-num');

// post "" => ""=>""
export const lockWallet = data => post('admin/member/member-wallet/lock-wallet', data);

// post "" => ""=>""
export const unlockWallet = data => post('admin/member/member-wallet/unlock-wallet', data);

// post "" => ""=>""
export const cancelOrder = data => post('admin/exchange/exchange-order/cancel', data);

// post "" => ""
export const fixPersonalPW = data => post('admin/system/employee/update-password', data);

// post "" => ""
export const accessLog = (url, data) => fetch(`admin/system/access-log/page-query/${url}`, data);

// post "" => ""
export const addVote = (data, config) => postConfig('admin/system/vote/merge', data, config);

// post "" => ""
export const queryVote = data => post('admin/system/vote/page-query', data);

// post "" => ""
// export const queryDividend = data => post('admin/system/dividend/page-query', data);

// post "" => ""
export const startDividend = data => post('admin/system/dividend/start', data);

// post "" => ""
export const queryDividendFee = data => post('admin/system/dividend/fee/info', data);

// post "" => ""
export const querySysCoin = data => post('admin/system/coin/page-query', data);

// post "" => ""
export const addSysCoin = data => post('admin/system/coin/create', data);

// post "" => ""
export const updateSysCoin = data => post('admin/system/coin/update', data);

// post "" => ""
export const sysCoinDetail = data => post('admin/system/coin/detail', data);

// post "" => ""
export const queryTansAdr = () => post('admin/system/transfer-address/page-query');

// post "" => "/"
export const auditTansAdr = data => post('admin/system/transfer-address/merge', data);

// post "" => ""
export const tansAdrDetail = data => post('admin/system/transfer-address/detail', data);

// post "" => ""
export const delTansAdr = data => post('admin/system/transfer-address/deletes', data);

// POST ""=>""
export const getLoginCode = data => post('admin/system/employee/check', data);

// POST ""=>""
export const signIn = data => post('admin/system/employee/sign/in', data);

// POST ""=>""
export const getCodeAgain = data => post('admin/code/sms-provider/login', data);

// POST ""=>""=>""
export const coinReviseSys = data => post('admin/code/sms-provider/system/coin-revise', data);

// POST ""=>""=>""
export const setPlatformCoin = data => post('admin/system/coin/set/platform', data);

// POST ""=>""=>""
export const createMemberWallet = data => post('admin/system/coin/create-member-wallet', data);

// POST ""=>""=>""
export const transferColdWallet = data => post('admin/system/coin/transfer', data);

// POST ""=>""=>""
export const getColdWalletCode = data => post('admin/code/sms-provider/transfer-cold-wallet', data);

// POST ""=>""=>""
export const coinTransferDetail = data => post('admin/system/coin/hot-transfer-record/page-query', data);

// POST ""=>""
export const addAuthenticationSys = data => post('admin/system/member-application-config/merge', data);

// POST ""=>""
export const queryAuthenticationSys = data => post('admin/system/member-application-config/detail', data);

// POST ""=>""=>"/"
export const publishAdvOtc = data => post('admin/member/alter-publish-advertisement-status	', data);

// POST ""=>""=>"/"
export const forbiddenMemberTrans = data => post('admin/member/alter-transaction-status', data);

// POST ""=>""=>"/"
export const forbiddenMember = data => post('admin/member/alter-status', data);

// POST ""=>""=>""
export const resetMemberAddr = data => post('admin/member/member-wallet/reset-address', data);

// POST ""=>""=>""
export const advDetailOtc = data => post('admin/otc/advertise/detail', data);

// POST ""=>""=>""
export const queryRecommend = data => post('admin/promotion/member/page-query', data);

// POST ""=>""=>""
export const queryRewardRecommend = data => fetch('admin/promotion/reward/page-query', data);

// POST ""=>""=>""
export const rewardRecommendDetail = data => post('admin/promotion/reward/detail', data);

// POST ""=>""=>"/"
export const auditRewardRecommend = data => post('admin/promotion/reward/merge', data);

// POST ""=>""=>""
export const recommendDetail = data => post('admin/promotion/member/details', data);

// POST ""=>""=>""
export const recommendOutExcel = data => fetch('admin/promotion/member/out-excel', data);

// POST ""=>""=>""
export const appealManageDetail = data => post('admin/otc/appeal/detail', data);

// POST ""=>""=>"GET"
export const dictionaryQuery = data => fetch('admin/system/data-dictionary', data);

// POST ""=>""=>"POST"
export const createDictionary = data => post('admin/system/data-dictionary', data);

// POST ""=>""=>""
export const updateDictionary = (url, data) => put(`admin/system/data-dictionary/${url}`, data);

// GET ""=>""=>""
export const memberSignQuery = data => fetch('admin/activity/member-sign-record/page-query', data);

// GET ""=>""=>""
export const activityQuery = data => fetch('admin/activity/sign/page-query', data);

// POST ""=>""=>""
export const createSign = data => post('admin/activity/sign', data);

// POST ""=>""=>""
export const activityList = data => post('admin/activity/activity/page-query', data);

// POST ""=>""=>""
export const addActivity = data => post('admin/activity/activity/add', data);

// POST ""=>""=>""
export const modifyActivity = data => post('admin/activity/activity/modify', data);

// POST ""=>""=>""
export const modifyActivityProgress = data => post('admin/activity/activity/modify-progress', data);

// GET "" => ""
export const activityDetail = parma => fetch(`admin/activity/activity/${parma}/detail`);

// GET "" => ""
export const activityOrderList = parma => fetch(`admin/activity/activity/${parma}/orderlist`);

// POST "" => ""
export const distributeOrder = data => post(`admin/activity/activity/distribute`, data);

// POST ""=>""=>""
export const signDetail = (url) => fetch(`admin/activity/sign/${url}`);

// POST ""=>""=>""
export const fixSignDetail = (url, data) => put(`admin/activity/sign/${url}`, data);

// POST ""=>""=>""
export const earlyCloseSign = url => patch(`admin/activity/sign/${url}/early-closing`);

// POST ""=>""=>""
export const queryIfEnd = () => fetch('admin/activity/sign/has-underway');

// POST ""=>""=>""
export const envelopeList = data => post('admin/envelope/page-query', data);

// POST ""=>""=>""
export const envelopeDetail = parma => fetch(`admin/envelope/${parma}/detail`);

// POST ""=>""=>""
export const envelopeReceiveDetail = data => post('admin/envelope/receive-detail', data);

// POST ""=>""=>""
export const envelopeAdd = data => post('admin/envelope/add', data);

// POST ""=>""=>""
export const envelopeModify = data => post('admin/envelope/modify', data);

// POST ""=>""=>""
export const tansTimeout = data => fetch('admin/system/coin/get-no-check-key', data);

// POST ""=>""=>""
export const financeTurnover = data => post('admin/finance/statistics/turnover-all', data);

// POST ""=>""=>""
export const financeFee = data => post('admin/finance/statistics/fee', data);

// POST ""=>""=>""
export const financeRecharge = data => post('admin/finance/statistics/recharge-or-withdraw-amount', data);

// POST ""=>""=>""
export const memberBoard = data => post('admin/index/statistics/member-statistics-info', data);

// POST ""=>""=>""
export const memberChart = data => post('admin/index/statistics/member-statistics-chart', data);

// POST ""=>""=>""
export const otcChart = data => post('admin/index/statistics/otc-statistics-num-chart', data);

// POST ""=>""=>""
export const otcBoard = data => post('admin/index/statistics/otc-statistics-turnover', data);

// POST ""=>""=>"/ "
export const coinChart = data => post('admin/index/statistics/exchange-statistics-turnover-chart', data);

// POST ""=>""=>"/ "
export const coinBoard = data => post('admin/index/statistics/exchange-statistics-turnover', data);

// =>
export const allOtcCoin = () => post('admin/otc/otc-coin/all-otc-coin-units');

// =>
export const allBaseCoin = () => post('admin/exchange/exchange-coin/all-base-symbol-units');

// =>
export const allExchangeUnits = data => post('admin/exchange/exchange-coin/all-coin-symbol-units', data);

// GET "" => ""
export const queryBusinessAuth = data => fetch('admin/business-auth/page', data);

// POST "" => ""
export const createBusinessAuth = data => post('admin/business-auth/create', data);

// GET "" => ""
export const updateBusinessAuth = data => patch('admin/business-auth/update', data);

// GET "" => "" => ""
export const queryCancelApply = data => post('admin/business/cancel-apply/page-query', data);

// GET "" => ""=>""
export const cancelApplyDetail = data => post('admin/business/cancel-apply/detail', data);

// GET "" => ""=>"/"
export const checkApply = data => post('admin/business/cancel-apply/check', data);

// POST "" => ""=>""
export const queryBusiness = data => post('admin/business-auth/apply/page-query', data);

// POST "" => ""=>""
export const queryBusinessStatus = () => post('admin/business-auth/get-search-status');

// POST "" => ""=>""
export const cancelBusinessStatus = () => post('admin/business/cancel-apply/get-search-status');

// POST "" => ""=>""
export const authBusinessDetail = data => post('admin/business-auth/apply/detail', data);

// post "" =>
export const parnter = data => post('admin/system/coin/add-partner', data);

// C2C CTC

// POST "C2C"=>""=>""
export const ctcOrderList = data => post('admin/ctc/order/page-query', data);

// POST "C2C"=>""=>""
export const ctcOrderDetail = data => post('admin/ctc/order/detail', data);

// POST "C2C"=>""=>""
export const ctcOrderConfirm = data => post('admin/ctc/order/confirm-order', data);

export const inviteRecord = data => postConfig('admin/invite/management/query', data);

// id
export const inviteSecondRecord = data => postConfig('admin/invite/management/info', data);

export const inviteRank = data => postConfig('admin/invite/management/rank', data);

export const alterRank = data => post('admin/invite/management/update-rank', data);

// POST "C2C"=>""=>""
export const ctcOrderPay = data => post('admin/ctc/order/pay-order', data);

// POST "C2C"=>""=>""
export const ctcOrderCancel = data => post('admin/ctc/order/cancel-order', data);

// POST "C2C"=>""=>""
export const ctcOrderComplete = data => post('admin/ctc/order/complete-order', data);

// POST "C2C"=>""=>""
export const ctcAcceptorList = data => post('admin/ctc/acceptor/page-query', data);

// POST "C2C"=>""=>""
export const ctcAcceptorSwitch = data => post('admin/ctc/acceptor/switch', data);

// POST ""=>"APP"=>""
export const sysAppRevision = data => fetch('admin/system/app-revision/page-query', data);
