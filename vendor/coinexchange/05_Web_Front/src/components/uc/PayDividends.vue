<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear record">
        <div class="col-xs-12 rightarea-con">
          <IxNoSurface socket-key="token.dividends" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Holder distributions — §13 socket, and the narrowest gap of the eight.
 *
 * Worth being precise, because this screen is one procedure away from being
 * real and the others are a service away. svc-token ALREADY distributes yield:
 * `token.distributeRevenue` is live, posts through packages/ledger-client, and
 * the tracker row token.yield is `done`. The money path exists and is correct.
 *
 * What does not exist is a window onto it. `distributeRevenue` carries
 * admin:treasury — an operator action — and no `token:read` procedure returns
 * one account's distribution history. So a holder who was genuinely paid still
 * has no way to see it, and this screen could not show it if they had been.
 *
 * ── TWO MONEY DEFECTS REMOVED WITH THE FETCH ───────────────────────────────
 *
 * 1. The total ran through `new Number(accumulative_return).toFixed(8)`. Money
 *    in a JS number is prohibited outright (doctrine §0, "never store money in
 *    a number"), and eight decimal places against numeric(38,18) truncates ten
 *    places of a figure the ledger holds exactly.
 * 2. `queryOrder` posted to /uc/asset/transaction/all — a second retired venue
 *    path, on a control that was already `display:none`. Hidden dead money code
 *    is worse than visible dead money code; it survives review by not being
 *    looked at.
 *
 * Neither is replaced with a "safe" formatting helper, because there is no
 * number here to format. When the read procedure lands, amounts arrive as
 * decimal strings and are rendered as strings.
 */
import IxNoSurface from '../intafaced/IxNoSurface.vue';

export default {
  name: 'UcPayDividends',
  components: { IxNoSurface }
};
</script>

<style scoped>
.nav-right {
  height: auto;
  overflow: hidden;
  padding: 0 0 0 15px;
}
</style>
