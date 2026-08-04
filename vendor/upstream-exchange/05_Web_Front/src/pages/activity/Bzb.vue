<template>
  <div class="content_container">
    <div class="wrapper">
      <IxNoSurface socket-key="token.rights" />
      <IxNoSurface socket-key="token.governance" />
    </div>
  </div>
</template>

<script>
/**
 * The token page — §13 socket, and the only unqualified public promise the
 * shell was still making.
 *
 * WHAT WAS HERE. Hardcoded English prose, not i18n-keyed, on a live route
 * (config/routes.js '/bzb', linked from the nav as "BZB ECO"). It stated as
 * settled fact that the token is a rights certificate capped at a fixed supply
 * that is never inflated; that holders share in trading-fee revenue and listing
 * distributions; that you may stake toward a super node; that node operators
 * carry governance weight, early visibility on listings, listing priority and a
 * claim on future distributions; and that early participants receive a
 * development allocation. Under it sat an eight-tile "Token Rights" grid whose
 * captions had been blanked to empty i18n strings but whose icons — dividends,
 * voting, governance, listing, disclosure, subscription — went on making the
 * same claims pictorially. Under that, a "Whitepaper" heading naming a PDF that
 * does not exist in this repository.
 *
 * WHY IT COULD NOT BE EDITED DOWN. Every one of those is false by a category,
 * not by a degree:
 *
 *   - "never inflated" — svc-token mints on an emission schedule every epoch,
 *     and EMISSIONS_AUTO_TICK can do it unattended. There is a cap. A cap is
 *     not the absence of inflation.
 *   - "holders share in trading-fee revenue" — the payout path is real and runs
 *     only when an operator invokes it by hand. No job, no schedule, no caller.
 *   - "governance weight" — ballots are recorded and correctly weighted, and no
 *     code in this repository can move a proposal to passed, rejected, executed
 *     or cancelled. Every proposal ever opened is still open.
 *   - super nodes, listing priority, early visibility, listing distributions,
 *     development allocation — no service implements any of them and no tracker
 *     row plans them.
 *
 * Rewording would have produced a softer version of the same promise. The
 * rights a token carries are an owner decision (DIRECTION-2026-07-31 §8.10) and
 * these particular ones arrived with the vendored tree describing a different
 * platform, so they are removed rather than restated with our name on them.
 *
 * WHY SOCKET AND NOT DELETE. The registry's own rule: a tracker row exists →
 * socket, no row and the screen promises money → delete. token.yield and
 * token.governance are real rows the platform intends to build, so the page
 * stays and states its gap. Both rows were `done` when this was written and
 * were corrected to `socket` in the same pass — a socket citing a row that
 * claims the feature already ships would just relocate the lie.
 *
 * The nav entry stays too. A reader who clicks "BZB ECO" should arrive
 * somewhere that tells them where the token actually stands; removing the link
 * would hide the answer rather than give it.
 *
 * Money note: this file no longer renders a figure of any kind — no supply, no
 * share, no rate. It never had one that came from the system.
 */
import IxNoSurface from '../../components/intafaced/IxNoSurface.vue';

export default {
  name: 'BzbTokenRights',
  components: { IxNoSurface },
  created() {
    this.init();
  },
  computed: {
    lang() {
      return this.$store.state.lang;
    }
  },
  methods: {
    init() {
      this.$store.commit('navigate', 'nav-bzb');
    }
  }
};
</script>

<style lang="scss" scoped>
.content_container {
  padding: 60px 0 20px 0;
  .wrapper {
    margin: 30px 12%;
    background-color: #000000;
    padding: 20px 40px;
  }
}
</style>
