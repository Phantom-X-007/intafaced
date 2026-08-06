/**
 * Order ticket block reasons — pure ladder (L3 shell S5 residual).
 *
 * Maps known desk state to stable block keys + operator-facing copy.
 * Never invents a balance or a halt that was not supplied.
 * CommonJS for golden tests (no bundler).
 */
'use strict';

/**
 * @param {{
 *   isLogin?: boolean,
 *   tradable?: boolean,
 *   feedLive?: boolean,
 *   walletReachable?: boolean,
 *   marketHalted?: boolean,
 *   submitting?: boolean
 * }} state
 * @returns {null | { key: string, message: string }}
 */
function classifyOrderBlock(state) {
  var s = state || {};
  if (s.submitting) {
    return { key: 'submitting', message: 'Order is already being submitted.' };
  }
  if (s.isLogin === false) {
    return { key: 'not_signed_in', message: 'Sign in to place an order.' };
  }
  if (s.marketHalted === true) {
    return { key: 'market_halted', message: 'This market is halted.' };
  }
  if (s.tradable === false) {
    return { key: 'not_tradable', message: 'This market is not tradable right now.' };
  }
  if (s.feedLive === false) {
    return { key: 'feed_down', message: 'Market data is not live — place only if you accept stale context, or wait.' };
  }
  if (s.walletReachable === false) {
    return { key: 'wallet_unreachable', message: 'Wallet is unreachable — cannot confirm balances.' };
  }
  return null;
}

module.exports = {
  classifyOrderBlock: classifyOrderBlock
};
