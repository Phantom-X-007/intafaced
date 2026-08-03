<template>
  <div class="activity">
    <div class="activity_container">
      <h1>{{$t("header.labdetail")}}</h1>
      <IxNoSurface socket-key="launchpad.detail" />
      <p class="back-link">
        <router-link to="/lab">{{$t('activity.moreactivity')}}</router-link>
      </p>
    </div>
  </div>
</template>

<script>
/**
 * Launchpad round detail — §13 socket, and the only one of the ten that could
 * have taken money from someone.
 *
 * ── WHY THE SUBSCRIBE FLOW IS DELETED, NOT DISABLED ────────────────────────
 *
 * The page read a round from `/uc/activity/detail`, read a venue wallet balance,
 * accepted an amount, sent an email or SMS confirmation code, and posted the
 * amount to `/uc/activity/attend`. Every one of those paths is on the retired
 * venue backend and unproxied, so the form was a live, enabled, validating
 * control that posted into nothing and reported whatever HTML came back as a
 * failure. Leaving it disabled behind a flag would still say "you may subscribe
 * to this, just not now". You may not: there is no round, and there is nowhere
 * for the money to go.
 *
 * Joining a round MOVES VALUE — it debits a subscription and later credits an
 * allocation. Doctrine §0.6 puts both writes in packages/ledger-client, and
 * neither recipe exists. Until they do, no surface in this shell may accept an
 * amount for a sale.
 *
 * ── THREE MONEY DEFECTS REMOVED WITH IT ────────────────────────────────────
 *
 * 1. `parseFloat(this.attendAmount) * this.activityDetail.price > this.mybalance`
 *    — a float multiply of an amount by a price, compared against a balance held
 *    in a JS `number` (`mybalance: 0`). Money in a number is prohibited outright,
 *    and this one gated whether a subscription was allowed to proceed.
 * 2. `temAlreadyAttendAmount += this.myRecordList[i].freezeAmount` — float
 *    accumulation across a participation history, then compared to a per-account
 *    cap. Repeated addition of binary floats is exactly where a cap silently
 *    stops holding.
 * 3. `holdPercent: (value / totalHold) * totalSupply` — a template filter
 *    dividing one float by another to render "your current allocation". It ran
 *    with `totalHold` of zero on any round nobody had joined, printing Infinity
 *    or NaN as an allocation figure.
 *
 * None are ported. When the round service exists, amounts cross the wire as
 * decimal strings and every one of these comparisons belongs on the server.
 */
import IxNoSurface from '../../components/intafaced/IxNoSurface.vue';

export default {
  name: 'ActivityDetail',
  components: { IxNoSurface },
  created: function() {
    this.$store.commit('navigate', 'nav-activity');
  }
};
</script>

<style lang="scss" scoped>
.activity {
  background: var(--ix-bg, #0a0c10);
  min-height: 100%;
  position: relative;
  overflow: hidden;
  padding-bottom: 50px;
  padding-top: 60px;
  color: var(--ix-text, #e8ebf0);
}
.activity_container {
  padding: 40px 12%;
  min-height: 600px;
  > h1 {
    font-size: 32px;
    line-height: 1;
    padding: 0 0 20px 0;
    letter-spacing: 3px;
  }
}
.back-link {
  margin-top: 24px;
  a {
    color: var(--ix-orange, #00c2a8);
  }
}
@media screen and (max-width: 768px) {
  .activity {
    padding-top: 45px;
  }
  .activity_container {
    padding: 24px 4%;
    > h1 {
      font-size: 20px;
    }
  }
}
</style>
