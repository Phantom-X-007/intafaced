<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear">
        <IxNoSurface socket-key="affiliate.cards" />
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Promotion cards — §13 socket.
 *
 * A card is a code that credits an account when redeemed. Nothing issues one
 * and nothing redeems one; both ends posted to the retired venue backend.
 *
 * ── WHY THE REDEEM FORM IS GONE AND NOT MERELY DISABLED ────────────────────
 *
 * The modal took a code and posted it. Against an unproxied path it came back
 * as HTML, failed the `code == 0` check, and showed "Exchange failed" — which
 * says the CODE was rejected. Someone holding a legitimate code would conclude
 * their code was bad, or used, or expired. A screen that turns "we did not
 * build this" into "your code is invalid" is worse than one that shows nothing,
 * so the form is removed rather than left to lie.
 *
 * ── AND WHY THIS IS NOT A SMALL FEATURE ────────────────────────────────────
 *
 * Redemption credits a balance. There is no ledger recipe for it and the
 * funding side was never named anywhere in the vendored flow — a credit with no
 * matching debit is not a card, it is a mint, and §0.6 puts that write in
 * packages/ledger-client or nowhere. Marketing spend is a real account and the
 * recipe has to post against it.
 *
 * The card-image export (html2canvas) went with the rest: it rendered a card
 * number onto a shareable graphic, and there are no card numbers.
 */
import IxNoSurface from '../intafaced/IxNoSurface.vue';

export default {
  name: 'UcPromotionMyCards',
  components: { IxNoSurface }
};
</script>

<style scoped lang="scss">
.nav-right {
  height: auto;
  overflow: hidden;
  padding: 0 0 0 15px;
.rightarea.bill_box {
    padding-left: 15px;
    width: 100%;
    height: auto;
    overflow: hidden;
  }
}
</style>
