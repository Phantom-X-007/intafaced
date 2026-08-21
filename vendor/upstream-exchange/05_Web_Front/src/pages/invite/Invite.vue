<template>
  <div class="ix-page invite-page">
    <div class="ix-page-head">
      <h1>{{ $t('header.invite') }}</h1>
      <p>{{ $t('invite.attribute.lead') }}</p>
      <div class="ix-source">{{ $t("shellResidual.svcIdentityPath") }}</div>
    </div>

    <!-- ── who this account is attributed to ─────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.referrer.title') }}</h2>
        <span class="ix-sub">affiliates.myReferrer</span>
      </div>
      <p class="ix-lead">{{ $t('invite.referrer.lead') }}</p>
      <IxState
        :loading="referrer.loading"
        :reason="referrer.reason"
        :message="referrer.message"
        endpoint="/api/identity/trpc/affiliates.myReferrer"
      >
        <div v-if="referrer.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.referrer.id') }}</span>
            <span class="v">{{ referrer.data.referrerId }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.referrer.userId') }}</span>
            <span class="v">{{ referrer.data.userId }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.referrer.attributedAt') }}</span>
            <span class="v">{{ referrer.data.attributedAt }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('invite.referrer.empty') }}</div>
      </IxState>
    </div>

    <!-- ── paste a UUID and attribute once ───────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.attribute.title') }}</h2>
        <span class="ix-sub">affiliates.attribute</span>
      </div>
      <p class="ix-lead">{{ $t('invite.attribute.formLead') }}</p>

      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-invite-referrer">{{ $t('invite.attribute.hint') }}</label>
          <Input
            element-id="ix-invite-referrer"
            v-model="referrerId"
            :placeholder="$t('invite.attribute.hint')"
            @on-enter="submitAttribute"
          ></Input>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :loading="attributed.busy" :disabled="!canAttribute" @click="submitAttribute">
            {{ $t('invite.attribute.btn') }}
          </Button>
        </div>
      </div>

      <div v-if="attributed.ran">
        <div v-if="attributed.reason === 'ok'" class="ix-done">
          <strong>{{ $t('invite.attribute.ok') }}</strong>
          <div style="margin-top:6px;">{{ attributed.data && attributed.data.referrerId }}</div>
        </div>
        <IxState
          v-else
          :loading="attributed.busy"
          :reason="attributed.reason"
          :message="attributed.message"
          endpoint="/api/identity/trpc/affiliates.attribute"
        ></IxState>
      </div>
    </div>

    <!-- ── policy honesty: structure yes, invented rates no ──────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.attribute.policyTitle') }}</h2>
        <span class="ix-sub">affiliates.policy</span>
      </div>
      <p class="ix-lead">{{ $t('invite.attribute.policyLead') }}</p>
      <IxState
        :loading="policy.loading"
        :reason="policy.reason"
        :message="policy.message"
        endpoint="/api/identity/trpc/affiliates.policy"
      >
        <div v-if="policy.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.policyInventsRates') }}</span>
            <span class="v">{{ policy.data.inventsCommissionRates ? $t('invite.attribute.yes') : $t('invite.attribute.no') }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.policyInventsPayouts') }}</span>
            <span class="v">{{ policy.data.inventsPayoutMagnitudes ? $t('invite.attribute.yes') : $t('invite.attribute.no') }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.policyLedgerOnly') }}</span>
            <span class="v">{{ policy.data.moneyViaLedgerClientOnly ? $t('invite.attribute.yes') : $t('invite.attribute.no') }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.policyDepthCap') }}</span>
            <span class="v">{{ policy.data.maxReferralDepthCap }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.policyPayoutResidual') }}</span>
            <span class="v">{{ policy.data.payoutResidual }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.policyAccrualResidual') }}</span>
            <span class="v">{{ policy.data.accrualRateResidual }}</span>
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * Referral attribution — svc-identity `affiliates.attribute`.
 *
 * A signed-in user pastes a referrer UUID; the service records the edge once.
 * Self, cycle, unknown, already-set, and depth refusals arrive named via IxState.
 * Commission rates and payout magnitudes stay unpublished owner law — this
 * screen never prints a rate or an earnings figure.
 *
 * `affiliates.policy` is the honesty board (structure, not rates). Empty
 * referrer stays empty copy, never a zero.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'InvitePage',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      referrerId: '',
      referrer: this.emptySection(),
      policy: this.emptySection(),
      attributed: this.emptyAction()
    };
  },
  computed: {
    canAttribute() {
      return Boolean((this.referrerId || '').trim());
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-invite');
    this.reloadReferrer();
    this.load('policy', query('identity', 'affiliates.policy', undefined, this.ixToken));
  },
  methods: {
    reloadReferrer() {
      this.load('referrer', query('identity', 'affiliates.myReferrer', undefined, this.ixToken));
    },
    submitAttribute() {
      var self = this;
      var referrerId = (this.referrerId || '').trim();
      if (!referrerId) return;
      this.act(
        'attributed',
        mutate('identity', 'affiliates.attribute', { referrerId: referrerId }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.referrerId = '';
        self.reloadReferrer();
      });
    }
  }
};
</script>

<style lang="scss" scoped>
.invite-page {
  padding-top: 80px;
  padding-bottom: 60px;
}
</style>
