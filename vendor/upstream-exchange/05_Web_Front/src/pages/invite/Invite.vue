<template>
  <div class="invite">
    <div class="invite_container">
      <h1>{{$t("header.invite")}}</h1>
      <IxNoSurface socket-key="affiliate.overview" />
    </div>
  </div>
</template>

<script>
/**
 * Referral programme — §13 socket.
 *
 * ── THE PART THAT MATTERS MOST, FIRST ──────────────────────────────────────
 *
 * This page published a **fee-share rate card**: six partner tiers paying a
 * referrer 20%, 30%, 40%, 50% and 60% of a referred account's trading fees for
 * 6, 12 or 24 months or for life, plus a 5-15% "partner dividend" on top.
 *
 * Nobody here set those numbers. They arrived with the vendored tree.
 * DIRECTION-2026-07-31 §8.10 reserves `leader_share_bps` and **every other
 * fee-share rate** to the owner, alongside the jurisdiction list they may be
 * offered in — so an agent restating them, even behind a "coming soon" banner,
 * would be publishing a commercial commitment the platform never made. The
 * table is deleted rather than hidden. When the owner sets rates, they get
 * written down once, in a spec, and this screen reads them.
 *
 * The same pass removed, from this file and from the `invite.*` block in
 * assets/lang/en.js:
 *
 *   · Two worked EARNINGS EXAMPLES quoting a referrer "about 7200 / month" and
 *     "135000 / month" in CNY. Invented income projections attributed to this
 *     platform by name — the exact class of fabrication the landing page was
 *     just fixed for, and on a referral programme it is a regulated-marketing
 *     hazard as well as a false number.
 *   · "Get 30 cards for free (≈2000 CNY)" and "Free promotion grant of 2000
 *     CNY" — a free-money offer with an amount, funded by nothing.
 *   · A gift-card rule promising the card's value is "frozen for 180 days after
 *     collection and released into user account balance automatically" — an
 *     automatic balance credit with no ledger recipe behind it.
 *   · A superlative claim to pay "the highest proportion of online commission
 *     return and the longest time of commission return" in the market.
 *   · `promotion@intafaced.com`, a mailbox nobody owns, offered as the contact
 *     for paid custom card orders.
 *   · Two hardcoded fake leaderboard rows (`dataFanyong` / `dataFanyong1`) with
 *     invented user handles and commission figures. They were unbound in the
 *     template and so invisible — which is precisely why they survived every
 *     previous honesty pass. Dead fabricated data is one careless `:data` bind
 *     away from being live fabricated data.
 *   · Six partner tier names transliterated from the vendor's own imperial-rank
 *     scheme, and a worked example built around one of its personas — both
 *     stragglers from the vendored tree rather than anything chosen here.
 *
 * ── AND WHY IT IS A SOCKET RATHER THAN A DELETE ────────────────────────────
 *
 * `ops.affiliates` — "Multi-tier affiliate / IB trees, payout automation" — is a
 * live row in tooling/tracker/features.mjs. The platform intends to build this.
 * Deleting finished UI for a planned product is how a capability gets rebuilt
 * from nothing six months later, which is the failure the adoption ADR
 * (docs/adr/2026-08-02-adopt-vendored-product-keep-our-ledger.md) exists to
 * stop. The shell stays; the promises do not.
 *
 * ── WHAT IS ACTUALLY MISSING ───────────────────────────────────────────────
 *
 * svc-identity records no referrer on an account, so there is no tree at any
 * level and no query to write. No service consumes trade fees for a split, so
 * no commission has ever been computed. Both gaps are named on the panel.
 *
 * The invite link and its QR code went with the rest. They were built from the
 * venue session's `promotionPrefix + promotionCode` — a code that identifies a
 * referrer to a system that records no referrers. Handing someone a link that
 * credits nothing is a promise, not a convenience.
 */
import IxNoSurface from '../../components/intafaced/IxNoSurface.vue';

export default {
  name: 'InvitePage',
  components: { IxNoSurface },
  created: function() {
    this.$store.commit('navigate', 'nav-invite');
  }
};
</script>

<style lang="scss" scoped>
.invite {
  background: var(--ix-bg, #0a0c10);
  color: var(--ix-text, #e8ebf0);
  min-height: 100%;
  padding-top: 60px;
  padding-bottom: 60px;
  overflow: hidden;
}
.invite_container {
  padding: 40px 12%;
  min-height: 600px;
  > h1 {
    font-size: 32px;
    line-height: 1;
    padding: 0 0 20px 0;
    letter-spacing: 3px;
  }
}
@media screen and (max-width: 768px) {
  .invite {
    padding-top: 45px;
  }
  .invite_container {
    padding: 24px 4%;
    > h1 {
      font-size: 20px;
    }
  }
}
</style>
