<template>
  <div class="invite">
    <div class="invite_container">
      <h1>{{$t("header.invite")}}</h1>
      <p class="invite_lead">{{$t("invite.attributeLead")}}</p>
      <div class="invite_form">
        <label class="invite_label">{{$t("invite.referrer")}}</label>
        <Input v-model="referrerId" :placeholder="$t('invite.referrerId')" @on-enter="attribute"></Input>
        <Button type="primary" :loading="busy" @click="attribute">{{$t("invite.attribute")}}</Button>
      </div>
      <p v-if="ok" class="invite_ok">{{$t("invite.attributeOk")}}</p>
      <p v-if="error" class="invite_error">{{ error }}</p>
    </div>
  </div>
</template>

<script>
/**
 * Referral programme — attribute a referrer.
 *
 * Records who referred this account. Does not publish a rate card, income
 * projection, or payout. Those stay an owner decision, written down once.
 *
 * The write is identity affiliates.attribute with {referrerId}.
 */
import { mutate } from '../../config/intafaced.js';

export default {
  name: 'InvitePage',
  data: function() {
    return { referrerId: '', busy: false, ok: false, error: '' };
  },
  created: function() {
    this.$store.commit('navigate', 'nav-invite');
  },
  methods: {
    attribute: function() {
      var self = this;
      if (!this.referrerId) return;
      this.busy = true;
      this.ok = false;
      this.error = '';
      mutate('identity', 'affiliates.attribute', {referrerId: this.referrerId}, this.$store.getters.ixToken)
        .then(function(res) {
          self.busy = false;
          if (res.ok) {
            self.ok = true;
          } else {
            self.error = res.message || self.$t('invite.attributeFailed');
          }
        });
    }
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
.invite_lead {
  color: var(--ix-text-dim, #9aa3b2);
  font-size: 15px;
  line-height: 1.6;
  margin: 0 0 24px 0;
  max-width: 40em;
}
.invite_form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}
.invite_label {
  font-size: 13px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #6b7380);
}
.invite_ok,
.invite_error {
  margin-top: 16px;
  font-size: 14px;
}
.invite_ok {
  color: var(--ix-ok, #3dcc8a);
}
.invite_error {
  color: var(--ix-danger, #e85d5d);
}
.invite_container {
  padding: 40px 64px;
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
    padding: 24px 20px;
    > h1 {
      font-size: 20px;
    }
  }
}
</style>
