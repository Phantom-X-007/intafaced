<template>
  <IxSocketPage
    :title="$t('uc.forget.socketTitle')"
    :lead="$t('uc.forget.socketLead')"
    source="svc-identity · /api/identity/trpc"
    :missing="$t('uc.forget.socketMissing')"
    :needs="needs"
  >
    <router-link to="/login">
      <Button type="primary" size="small">{{ $t('uc.forget.login') }}</Button>
    </router-link>
  </IxSocketPage>
</template>

<script>
/**
 * PASSWORD RESET — a §13 socket, because svc-identity has no reset procedure.
 *
 * The vendor screen drove four Java endpoints: `/uc/reset/email/code`,
 * `/uc/mobile/reset/code`, and `/uc/reset/login/password` once per channel,
 * each gated behind a third-party captcha widget. The identity router exposes
 * `auth.register`, `auth.login`, `auth.refresh`, `auth.logout`, `auth.logoutAll`
 * and `auth.stepUp` — and nothing that resets or changes a password. There is no
 * mail or SMS sender behind the edge either, so even the first step of a reset
 * flow has nothing to send a code with.
 *
 * This is the case the honesty rule exists for. A reset form left wired to the
 * dead backend takes an email address, spins, and never resolves — and the
 * reader concludes their reset link is on its way. Saying "not built" costs
 * them ten seconds; the spinner costs them their account.
 *
 * NOT STUBBED, deliberately. A fake "check your inbox" here would be
 * indistinguishable from a working reset until the new password failed.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'UcFindPwd',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('uc.forget.need1'),
        this.$t('uc.forget.need2'),
        this.$t('uc.forget.need3')
      ];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-other');
    this.$store.state.HeaderActiveName = '1-4';
  }
};
</script>
