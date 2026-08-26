<template>
  <div class="ix-page bank-page public-page invite-page">
    <div class="ix-page-head">
      <h1>{{ $t('header.invite') }}</h1>
      <p>{{ $t('invite.attribute.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>{{ $t("shellResidual.svcIdentityPath") }}</code></details>
    </div>

    <!-- ── who this account is attributed to ─────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.referrer.title') }}</h2>
        <span class="ix-sub">affiliates.myReferrer</span>
      </div>
      <p class="ix-lead">{{ $t('invite.referrer.lead') }}</p>
      <IxState compact
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

    <!-- ── one-tap share: token → this account; hits; revoke ─────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.share.title') }}</h2>
        <span class="ix-sub">affiliates.createShare</span>
      </div>
      <p class="ix-lead">{{ $t('invite.share.lead') }}</p>

      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-form-action">
          <Button type="primary" :loading="shared.busy" @click="submitShare">
            {{ $t('invite.share.btn') }}
          </Button>
        </div>
        <div v-if="shared.data && shared.data.token" class="ix-form-action">
          <Button :loading="revoked.busy" @click="submitRevoke">
            {{ $t('invite.share.revoke') }}
          </Button>
        </div>
      </div>

      <div v-if="shared.ran">
        <div v-if="shared.reason === 'ok' && shared.data" class="ix-done">
          <strong>{{ $t('invite.share.ok') }}</strong>
          <div class="ix-kv" style="margin-top:12px;">
            <div class="ix-kv-item">
              <span class="k">{{ $t('invite.share.url') }}</span>
              <span class="v">{{ shareUrl }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('invite.share.hits') }}</span>
              <span class="v">{{ shared.data.hits }}</span>
            </div>
          </div>
        </div>
        <IxState compact
          v-else
          :loading="shared.busy"
          :reason="shared.reason"
          :message="shared.message"
          endpoint="/api/identity/trpc/affiliates.createShare"
        ></IxState>
      </div>
      <div v-else class="ix-note ix-note-quiet">{{ $t('invite.share.empty') }}</div>

      <div v-if="revoked.ran && revoked.reason !== 'ok'" style="margin-top:12px;">
        <IxState compact
          :loading="revoked.busy"
          :reason="revoked.reason"
          :message="revoked.message"
          endpoint="/api/identity/trpc/affiliates.revokeShare"
        ></IxState>
      </div>
      <div v-if="hit.ran" style="margin-top:12px;">
        <div v-if="hit.reason === 'ok'" class="ix-done">{{ $t('invite.share.hitOk') }}</div>
        <IxState compact
          v-else
          :loading="hit.busy"
          :reason="hit.reason"
          :message="hit.message"
          endpoint="/api/identity/trpc/affiliates.shareHits"
        ></IxState>
      </div>
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
        <IxState compact
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
      <IxState compact
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

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.attribute.feeShareTitle') }}</h2>
        <span class="ix-sub">trade.copy.deskStatus</span>
      </div>
      <p class="ix-lead">{{ $t('invite.attribute.feeShareLead') }}</p>
      <IxState compact
        :loading="feeShare.loading"
        :reason="feeShare.reason"
        :message="feeShare.message"
        endpoint="/api/trade/trpc/copy.deskStatus"
      >
        <div v-if="feeShareBps !== null" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('invite.attribute.feeShareBps') }}</span>
            <span class="v">{{ feeShareBps }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('invite.attribute.feeShareUnset') }}</div>
      </IxState>
    </div>

    <!-- ── durable accruals + ancestor ids; empty when unpublished ──────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('invite.accruals.title') }}</h2>
        <span class="ix-sub">affiliates.myAccruals</span>
      </div>
      <p class="ix-lead">{{ $t('invite.accruals.lead') }}</p>

      <IxState compact
        :loading="ancestors.loading"
        :reason="ancestors.reason"
        :message="ancestors.message"
        endpoint="/api/identity/trpc/affiliates.myAncestors"
      >
        <div v-if="ancestorIds.length" class="ix-kv" style="margin-bottom:16px;">
          <div v-for="id in ancestorIds" :key="id" class="ix-kv-item">
            <span class="k">{{ $t('invite.accruals.ancestorId') }}</span>
            <span class="v">{{ id }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet" style="margin-bottom:16px;">{{ $t('invite.accruals.ancestorsEmpty') }}</div>
      </IxState>

      <IxState compact
        :loading="accruals.loading"
        :reason="accruals.reason"
        :message="accruals.message"
        endpoint="/api/identity/trpc/affiliates.myAccruals"
      >
        <div v-if="accrualRows.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('invite.accruals.feeEventId') }}</th>
                <th>{{ $t('invite.accruals.payerId') }}</th>
                <th>{{ $t('invite.accruals.hop') }}</th>
                <th>{{ $t('invite.accruals.feeAmount') }}</th>
                <th>{{ $t('invite.accruals.commissionAmount') }}</th>
                <th>{{ $t('invite.accruals.asset') }}</th>
                <th>{{ $t('invite.accruals.accruedAt') }}</th>
                <th>{{ $t('invite.accruals.sourceModule') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in accrualRows" :key="row.feeEventId">
                <td>{{ row.feeEventId }}</td>
                <td>{{ row.payerId }}</td>
                <td>{{ row.hop }}</td>
                <td>{{ row.feeAmount }}</td>
                <td>{{ row.commissionAmount }}</td>
                <td>{{ row.asset }}</td>
                <td>{{ row.accruedAt }}</td>
                <td>{{ row.sourceModule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('invite.accruals.empty') }}</div>
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
 * referrer stays empty copy, never a zero. Accruals list durable rows or
 * empty copy — never invented commissions.
 *
 * One-tap share: `affiliates.createShare` mints a revocable token mapped to
 * this account. Opening `/invite?share=` signed-out calls `shareHits` (hit +1).
 * Signed-in `shareHits` attributes via the same `affiliates.attribute` path.
 * Revoke kills the token so later hits do not attribute.
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
      feeShare: this.emptySection(),
      accruals: this.emptySection(),
      ancestors: this.emptySection(),
      attributed: this.emptyAction(),
      shared: this.emptyAction(),
      revoked: this.emptyAction(),
      hit: this.emptyAction()
    };
  },
  computed: {
    canAttribute() {
      return Boolean((this.referrerId || '').trim());
    },
    shareUrl() {
      var token = this.shared.data && this.shared.data.token;
      if (!token) return '';
      var origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      return origin + '/invite?share=' + token;
    },
    accrualRows() {
      return (this.accruals.data && this.accruals.data.rows) || [];
    },
    ancestorIds() {
      return Array.isArray(this.ancestors.data) ? this.ancestors.data : [];
    },
    feeShareBps() {
      var status = this.feeShare.data;
      if (!status || status.feeSharePublished !== true) return null;
      return typeof status.leaderShareBps === 'string' && /^\d+$/.test(status.leaderShareBps)
        ? status.leaderShareBps
        : null;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-invite');
    this.reloadReferrer();
    this.load('policy', query('identity', 'affiliates.policy', undefined, this.ixToken));
    this.load('feeShare', query('trade', 'copy.deskStatus', undefined, this.ixToken));
    this.load('accruals', query('identity', 'affiliates.myAccruals', { limit: 50 }, this.ixToken));
    this.load('ancestors', query('identity', 'affiliates.myAncestors', undefined, this.ixToken));
    this.consumeShareQuery();
  },
  watch: {
    ixToken: function(val, prev) {
      if (val && !prev) this.consumeShareQuery();
    }
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
    },
    submitShare() {
      this.revoked = this.emptyAction();
      this.act('shared', mutate('identity', 'affiliates.createShare', {}, this.ixToken));
    },
    submitRevoke() {
      var self = this;
      this.act('revoked', mutate('identity', 'affiliates.revokeShare', {}, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.shared = self.emptyAction();
      });
    },
    consumeShareQuery() {
      var raw = this.$route && this.$route.query && this.$route.query.share;
      var token = Array.isArray(raw) ? raw[0] : raw;
      if (!token) return;
      var self = this;
      this.act('hit', mutate('identity', 'affiliates.shareHits', { token: token }, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        if (self.ixToken) self.reloadReferrer();
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
