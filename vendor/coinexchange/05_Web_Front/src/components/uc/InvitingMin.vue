<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear record">
        <div class="col-xs-12 rightarea-con">
          <IxNoSurface socket-key="affiliate.rebates" />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Referral rebates — §13 socket.
 *
 * Posted to the retired venue backend for a rebate ledger keyed on a referral
 * tree that svc-identity does not record.
 *
 * The two headline figures were a cumulative return and a pending return. The
 * screen had already been made careful about them — unknown rendered as an
 * em-dash rather than a zero, which was the right instinct. It is not enough on
 * its own: an em-dash says "we could not read this", and the truth is that
 * there is nothing to read and no arithmetic anywhere that would produce it.
 * The date range picker and its query are gone with the fetch, because
 * filtering nothing by date is a control that implies data exists behind it.
 *
 * A rebate is a share of a trading fee. It moves value, so when it is built it
 * is a recipe in packages/ledger-client (§0.6) and the rate is the owner's to
 * set (DIRECTION-2026-07-31 §8.10) — not a promotions module holding a balance.
 */
import IxNoSurface from '../intafaced/IxNoSurface.vue';

export default {
  name: 'UcInvitingMin',
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
