<template>
  <div class="activity">
    <div class="activity_container">
      <h1>{{$t("header.labdetail")}}</h1>
      <div class="main">
        <IxNoSurface socket-key="launchpad.list" />
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Launchpad listing — §13 socket.
 *
 * ── WHAT THIS SCREEN USED TO DO, AND WHY NONE OF IT SURVIVED ───────────────
 *
 * Five tab panes, each posting `/uc/activity/page-query` to the retired venue
 * backend with a different `step` filter, each rendering a card with a progress
 * bar, a total supply, a price and a window.
 *
 * nginx proxies `/api/` and `/ws` and nothing else, so that path fell through
 * to `try_files ... /index.html`: HTTP 200, an HTML body, `res.body.code`
 * undefined. Every tab therefore took the failure branch and printed "Activity
 * service did not answer" — accurate about the request and misleading about the
 * platform, because it reads as an outage of something that exists.
 *
 * Rewiring was checked before socketing. There is no svc-launch; the edge route
 * table has no launch prefix; and `launch.*` on svc-protocol is the ERC-20 token
 * FACTORY — can a creator deploy a contract — with no concept of a sale, a
 * round, an allocation or a participant. There was no procedure to point at.
 *
 * ── ONE INVENTED NUMBER REMOVED ────────────────────────────────────────────
 *
 * The list computed its own progress bar for holdings-split rounds: step 1 → 50%,
 * step 2 → 75%, step 3 → 100%. Those percentages were a browser-side fabrication
 * with no server field behind them — a completion figure invented from a status
 * enum. It is gone with the fetch and is not to be reintroduced when the real
 * service lands: progress is a number the service that owns the sale computes,
 * or it is not shown.
 */
import IxNoSurface from '../../components/intafaced/IxNoSurface.vue';

export default {
  name: 'ActivityList',
  components: { IxNoSurface },
  created: function() {
    this.$store.commit('navigate', 'nav-lab');
  }
};
</script>

<style lang="scss" scoped>
/* The vendor page was a light panel (#f2f6fa) carrying a marketing banner for
   rounds that do not exist. Dropped to the platform surface so the socket reads
   as part of the same system as every other honest-state screen. */
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
