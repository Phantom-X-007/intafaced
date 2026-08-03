<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear">
        <IxNoSurface socket-key="launchpad.myorders" />
      </div>
    </div>
  </div>
</template>

<script>
/**
 * My launchpad participation — §13 socket.
 *
 * Posted to /uc/activity/getmyorders on the retired venue backend, which is not
 * proxied, so the table loaded forever behind a sign-in error.
 *
 * The columns are the reason this cannot be quietly left as an empty table: it
 * rendered a subscribed amount and a turnover per row. Both are money, both came
 * from a venue table rather than the ledger, and an empty grid with those
 * headings still tells a reader "you have participated in nothing" — a claim we
 * have no basis for, because nothing is recording participation at all.
 */
import IxNoSurface from '../intafaced/IxNoSurface.vue';

export default {
  name: 'UcInnovationOrders',
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
