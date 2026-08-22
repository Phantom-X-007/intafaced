<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.pay.title') }}</h1>
      <p>{{ $t('intafaced.modules.pay.blurb') }}</p>
      <div class="ix-source">svc-pay · /api/pay/trpc</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.pay.note') }}
    </div>

    <!-- ── is the service there, and what rails does it know about ───────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.healthTitle') }}</h2>
        <span class="ix-sub">health</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.healthLead') }}</p>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/pay/trpc/health">
        <div v-if="health.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">service</span>
            <span class="v">{{ health.data.service }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.rails') }}</span>
            <span class="v">{{ (health.data.rails && health.data.rails.length) ? health.data.rails.join(', ') : $t('intafaced.pay.noRails') }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── the rails, in the detail an operator needs ────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.railHealthTitle') }}</h2>
        <span class="ix-sub">railHealth</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.railHealthLead') }}</p>
      <IxState :loading="railHealth.loading" :reason="railHealth.reason" :message="railHealth.message" endpoint="/api/pay/trpc/railHealth">
        <div v-if="railHealth.data && railHealth.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.railId') }}</th>
                <th>{{ $t('intafaced.pay.mode') }}</th>
                <th>{{ $t('intafaced.pay.capabilities') }}</th>
                <th>{{ $t('intafaced.pay.usable') }}</th>
                <th>{{ $t('intafaced.pay.healthy') }}</th>
                <th>{{ $t('intafaced.pay.latency') }}</th>
                <th>{{ $t('intafaced.pay.railReason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in railHealth.data" :key="r.id">
                <td>{{ r.id }}</td>
                <td>{{ r.mode }}</td>
                <td>{{ r.capabilities.join(', ') }}</td>
                <td>{{ r.usable ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ r.healthy ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ r.latencyMs }} ms</td>
                <td>{{ r.reason ? r.reason : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noRails') }}</div>
      </IxState>
    </div>

    <!-- ── whether this account is a merchant at all ─────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.merchantTitle') }}</h2>
        <span class="ix-sub">merchant.me</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.overview.merchantLead') }}</p>
      <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
        <div v-if="merchant.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.merchantMode') }}</span>
            <span class="v">{{ merchant.data.mode }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.bank.status') }}</span>
            <span class="v">{{ merchant.data.status }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.kybStatus') }}</span>
            <span class="v">{{ merchant.data.kybStatus }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.overview.notAMerchant') }}</div>
      </IxState>
      <div class="ix-actions" style="margin-top:16px;">
        <router-link to="/pay/merchant">
          <Button size="small">{{ $t('intafaced.pay.overview.openMerchant') }}</Button>
        </router-link>
      </div>
    </div>

    <!-- ── enqueue a fraud review — scoring door, no ledger value ──────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.overview.fraudReviewTitle') }}</h2>
        <span class="ix-sub">fraud.enqueueReview</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.overview.fraudReviewLead') }}</p>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-fr-merchant">{{ $t('intafaced.pay.merchantId') }}</label>
          <Input element-id="ix-fr-merchant" v-model="form.merchantId" :placeholder="$t('intafaced.pay.networkPage.merchantIdHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-fr-amount">{{ $t('intafaced.pay.amount') }}</label>
          <Input element-id="ix-fr-amount" v-model="form.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-fr-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-fr-asset" v-model="form.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-fr-payment">{{ $t('intafaced.pay.overview.fraudReviewPaymentOptional') }}</label>
          <Input element-id="ix-fr-payment" v-model="form.paymentId" :placeholder="$t('intafaced.pay.overview.fraudReviewPaymentHint')"></Input>
        </div>
      </div>

      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.pay.overview.fraudReviewIdempotency') }} <code>{{ draftId('fraudReview') }}</code>
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="queued.busy" :disabled="!canEnqueue" @click="enqueueReview">
          {{ $t('intafaced.pay.overview.fraudReviewEnqueue') }}
        </Button>
      </div>

      <div v-if="queued.ran" style="margin-top:14px;">
        <div v-if="queued.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.pay.overview.fraudReviewQueued') }}</strong>
          <div style="margin-top:6px;">
            {{ $t('intafaced.pay.overview.fraudReviewId') }}: {{ queued.data.id }} ·
            {{ $t('intafaced.bank.status') }}: {{ queued.data.status }}
          </div>
        </div>
        <IxState v-else :loading="queued.busy" :reason="queued.reason" :message="queued.message" endpoint="/api/pay/trpc/fraud.enqueueReview"></IxState>
      </div>
    </div>

    <!-- ── the rest of the vertical ─────────────────────────────────────── -->
    <div class="ix-grid">
      <router-link v-for="row in nav.slice(1)" :key="row.to" :to="row.to" class="ix-tile">
        <h3>{{ $t(row.labelKey) }}</h3>
        <p>{{ $t(row.labelKey + 'Blurb') }}</p>
        <div class="ix-source" style="margin:0;">{{ row.procedures }}</div>
      </router-link>
    </div>
  </div>
</template>

<script>
/**
 * svc-pay — the vertical's front page (§6.1).
 *
 * It used to be the WHOLE of /pay: health, one balance box and a withdrawal
 * list, on a service that runs a merchant acquirer, hosted checkout, a payment
 * lifecycle, settlement and payouts. Those are now screens under
 * `config/ix-nav.js`, and this page answers only the questions that belong at
 * the top of a vertical: is the service there, which rails does it have, and is
 * this account a merchant.
 *
 * `railHealth` IS drawn even though it demands `pay:read`, which an ordinary
 * interactive session is not issued. That is deliberate: `IxState` renders a
 * SCOPE_DENIED as the named refusal it is, which is a true statement about the
 * platform. Leaving it off the page — the previous screen's choice — hid the
 * gap instead of reporting it, and a reader could not tell the surface from a
 * surface that does not exist.
 *
 * `merchant.me` answers `null` for an account that has never onboarded. That is
 * a 200 with no merchant, not a refusal, so it renders as the empty state and
 * points at the screen that creates one.
 *
 * `fraud.enqueueReview` is the only write on this page. It posts no ledger
 * value. The amount stays a decimal string. `id` is minted once per draft so a
 * retry is the same case. The service re-scores and refuses by name unless the
 * outcome is review. Admin queue list/resolve stay off this screen.
 */
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../config/intafaced.js';
import { PAY_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPay',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      health: this.emptySection(),
      railHealth: this.emptySection(),
      merchant: this.emptySection(),
      form: { merchantId: '', amount: '', assetId: 'USDT', paymentId: '' },
      queued: this.emptyAction()
    };
  },
  computed: {
    canEnqueue() {
      return Boolean(this.form.merchantId && this.form.amount && this.form.assetId && this.draftId('fraudReview'));
    }
  },
  created() {
    var self = this;
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.load('railHealth', query('pay', 'railHealth', undefined, this.ixToken));
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken)).then(function(res) {
      if (res && res.ok && res.data && res.data.id && !self.form.merchantId) {
        self.form.merchantId = res.data.id;
      }
    });
  },
  methods: {
    enqueueReview() {
      var self = this;
      if (!this.canEnqueue) return;
      var id = this.draftId('fraudReview');
      if (!id) return;
      var input = {
        id: id,
        merchantId: this.form.merchantId,
        amount: this.form.amount,
        assetId: this.form.assetId
      };
      if (this.form.paymentId) input.paymentId = this.form.paymentId;
      this.act('queued', mutate('pay', 'fraud.enqueueReview', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('fraudReview');
        self.form.amount = '';
        self.form.paymentId = '';
      });
    }
  }
};
</script>
