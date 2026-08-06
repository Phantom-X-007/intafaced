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
 * Worth being precise, because the money path here is real and the gap is not
 * where it first looks. `token.distributeRevenue` computes the pro-rata split
 * correctly and posts it through packages/ledger-client. That part is built.
 *
 * TWO THINGS ARE MISSING, NOT ONE. Corrected 2026-08-03 — this comment used to
 * say the tracker row token.yield was `done`; it is now a §13 socket:
 *
 * 1. No schedule. §4.3 calls for a weekly job that aggregates the house fee
 *    accounts; it does not exist. `distributeRevenue` has no caller anywhere
 *    outside its own tests — no cron, no bus subscriber, no admin form — and it
 *    carries admin:treasury, so it pays out only when a person invokes it by
 *    hand, on amounts that person typed. Nothing checks those amounts against
 *    the houseFees balance they claim to sweep.
 * 2. No read. No `token:read` procedure returns one account's distribution
 *    history, so a holder who genuinely was paid has no way to see it, and this
 *    screen could not show it if they had been.
 *
 * Copy here says distributions are settled by an operator. It must never say a
 * holder earns yield automatically — see the token.yield socket in
 * config/sockets.js and the row in tooling/tracker/features.mjs.
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
