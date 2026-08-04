<template>
  <div class="nav-rights">
    <div class="nav-right col-xs-12 col-md-10 padding-right-clear">
      <div class="bill_box rightarea padding-right-clear">
        <IxNoSurface socket-key="affiliate.referrals" />
      </div>
    </div>
  </div>
</template>

<script>
/**
 * People you referred — §13 socket.
 *
 * This was the only one of the promotions screens that shows no money: a list
 * of accounts and whether each finished verification. It is still unbuildable,
 * and the reason is worth stating precisely because "it is only a list" invites
 * someone to think it is nearly free. svc-identity records no referrer on an
 * account. There is no edge along which to walk, so the query has no FROM.
 *
 * It previously posted to /uc/promotion/record on the retired venue backend,
 * which nginx does not proxy — the table sat on its loading state and then
 * printed a sign-in error, which is a misleading thing to tell someone who is
 * already signed in.
 */
import IxNoSurface from '../intafaced/IxNoSurface.vue';

export default {
  name: 'UcMyPromotion',
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
