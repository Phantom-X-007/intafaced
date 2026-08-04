<template>
  <IxSocketPage
    class="ctc-page"
    :title="$t('ctc.socketTitle')"
    :lead="$t('ctc.socketLead')"
    source="no service"
    :missing="$t('ctc.socketMissing')"
    :needs="needs"
  >
    <router-link to="/otc">
      <Button type="primary" size="small">{{ $t('ctc.goOtc') }}</Button>
    </router-link>
  </IxSocketPage>
</template>

<script>
/**
 * QUICK BUY / SELL — a §13 socket, because the platform is not a counterparty.
 *
 * WHAT THIS SCREEN WAS. A desk where the PLATFORM sold you USDT at its own
 * quoted rate: `/uc/ctc/new-ctc-order`, `/uc/ctc/pay-ctc-order`,
 * `/uc/ctc/cancel-ctc-order`, priced off `/market/ctc-usdt`, settled against
 * `/uc/asset/wallet`. Ten calls to the dead Java backend, of which only three
 * had a failure handler — so seven of them left their part of the screen stuck
 * mid-action rather than reporting anything.
 *
 * WHY svc-p2p IS NOT THE ANSWER, even though it looks adjacent. svc-p2p is
 * peer-to-peer: every offer has a maker who is another user, and escrow holds
 * that maker's asset. A quick-buy desk has the platform on the other side of the
 * trade, quoting its own price and selling its own inventory. Routing this
 * screen at `offers.*` would have produced something that looked like it worked
 * and was a different product — the user would think they were buying from us at
 * a platform rate, and would in fact be taking a stranger's offer.
 *
 * That distinction is the whole reason this is a socket rather than a rewire.
 * The peer-to-peer desk exists and works; it is one link away and named.
 *
 * WHAT ELSE IT WOULD NEED, beyond a counterparty decision: a price feed for the
 * quote, and a wallet balance to settle against. Both belong to surfaces outside
 * this screen and neither is behind the edge for this purpose today.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'CtcDesk',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('ctc.need1'),
        this.$t('ctc.need2'),
        this.$t('ctc.need3')
      ];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-otc');
  }
};
</script>

<style scoped>
.ctc-page {
  padding-top: 80px;
}
</style>
