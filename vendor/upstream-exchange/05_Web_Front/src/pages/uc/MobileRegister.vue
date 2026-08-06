<template>
  <IxSocketPage
    :title="$t('uc.regist.mobileSocketTitle')"
    :lead="$t('uc.regist.mobileSocketLead')"
    source="svc-identity · /api/identity/trpc"
    :missing="$t('uc.regist.mobileSocketMissing')"
    :needs="needs"
  >
    <router-link to="/register">
      <Button type="primary" size="small">{{ $t('uc.regist.regist') }}</Button>
    </router-link>
  </IxSocketPage>
</template>

<script>
/**
 * PHONE REGISTRATION — a §13 socket, and a pointer to the one that works.
 *
 * `/reg` was the mobile-web sign-up: a country dial code, a mainland-China
 * mobile number, an SMS code from `/uc/mobile/code`, and a submit to
 * `/uc/register/phone`. svc-identity registers on `{ handle, email, password }`
 * and has no phone identifier at all; there is also no SMS sender behind the
 * edge, so the code step could not be built even if the identifier existed.
 *
 * This is not the same gap as the password reset one. Registration DOES exist —
 * just not by phone — so the honest screen names the missing half and sends the
 * reader to the half that works, rather than presenting itself as a dead end.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'UcMobileRegister',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('uc.regist.mobileNeed1'),
        this.$t('uc.regist.mobileNeed2')
      ];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-other');
    if (this.$store.getters.isLogin) this.$router.push('/');
  }
};
</script>
