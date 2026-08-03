<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear record">
        <div class="col-xs-12 rightarea-con">
          <IxNoSurface socket-key="trade.mining" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Trade-fee mining / "mine amount" returns — §13 socket.
 *
 * Posted to the retired venue path for a mine ledger (api.uc.mylist), which was
 * removed from config/api.js with the other unproxied promotions endpoints.
 * nginx never proxied it; the screen either hung on HTML or painted totals that
 * came from nowhere this platform records.
 *
 * The columns and headlines are the reason this cannot stay as an "empty table"
 * with partial honesty: cumulative return, pending return, fee, and mine_amount
 * are yield figures with no named source. DIRECTION-2026-07-31 §7 requires a
 * named source for yield; mining.pool (Stratum/PPLNS) is a different product.
 * No tracker row plans fee-rebate mining. A screen quoting mine amounts we do
 * not pay is a promise we cannot keep — same class as the deleted cloud-mining
 * contracts (REMOVED in config/sockets.js).
 *
 * Socketed rather than deleted so existing /uc/trade links resolve to an honest
 * gap instead of a NotFound that looks like a broken bookmark.
 */
import IxNoSurface from '../intafaced/IxNoSurface.vue';

export default {
  name: 'UcMinTrade',
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
