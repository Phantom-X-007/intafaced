<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.merchantPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.merchantPage.lead') }}</p>
      <div class="ix-source">svc-pay · merchant.me · merchant.create · merchant.submitKyb · merchant.decideKybStub · merchant.profile · merchant.balances</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <!-- ── the merchant this account already is, or is not ───────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.merchantTitle') }}</h2>
        <span class="ix-sub">merchant.me</span>
      </div>
      <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
        <div v-if="merchant.data">
          <div class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.merchantId') }}</span>
              <span class="v" style="font-size:13px;">{{ merchant.data.id }}</span>
            </div>
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
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.kybRef') }}</span>
              <span class="v" style="font-size:13px;">{{ merchant.data.kybRef === null ? '—' : merchant.data.kybRef }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.feeBps') }}</span>
              <span class="v">{{ merchant.data.feeBps }} {{ $t('intafaced.token.bps') }}</span>
            </div>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.overview.notAMerchant') }}</div>
      </IxState>
    </div>

    <!-- ── become one ───────────────────────────────────────────────────── -->
    <div v-if="merchant.reason === 'ok' && !merchant.data" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.merchantPage.createTitle') }}</h2>
        <span class="ix-sub">merchant.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.merchantPage.createLead') }}</p>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label>{{ $t('intafaced.pay.merchantMode') }}</label>
          <Select v-model="createForm.mode">
            <Option value="gateway" :label="$t('intafaced.pay.modeGateway')"></Option>
            <Option value="psp" :label="$t('intafaced.pay.modePsp')"></Option>
            <Option value="payfac" :label="$t('intafaced.pay.modePayfac')"></Option>
          </Select>
        </div>
        <div class="ix-field">
          <label for="ix-mc-fee">{{ $t('intafaced.pay.feeBps') }}</label>
          <Input element-id="ix-mc-fee" v-model="createForm.feeBps" :placeholder="$t('intafaced.pay.feeBpsHint')"></Input>
        </div>
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="created.busy" :disabled="!canCreate" @click="submitCreate">
          {{ $t('intafaced.pay.merchantPage.createTitle') }}
        </Button>
      </div>

      <div v-if="created.ran" style="margin-top:14px;">
        <div v-if="created.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.pay.merchantCreated') }}</strong>
          <div style="margin-top:6px;">{{ created.data.id }}</div>
        </div>
        <IxState v-else :loading="created.busy" :reason="created.reason" :message="created.message" endpoint="/api/pay/trpc/merchant.create"></IxState>
      </div>
    </div>

    <template v-if="merchantId">
      <!-- ── verification ───────────────────────────────────────────────── -->
      <div class="ix-card">
        <div class="ix-card-head">
          <h2>{{ $t('intafaced.pay.kybTitle') }}</h2>
          <span class="ix-sub">merchant.submitKyb · merchant.decideKybStub</span>
        </div>
        <p class="ix-lead">{{ $t('intafaced.pay.merchantPage.kybLead') }}</p>

        <div class="ix-form-row" style="margin-bottom:16px;">
          <div class="ix-field">
            <label for="ix-kyb-ref">{{ $t('intafaced.pay.kybRef') }}</label>
            <Input element-id="ix-kyb-ref" v-model="kybRef" :placeholder="$t('intafaced.pay.kybRefHint')"></Input>
          </div>
          <div class="ix-form-action">
            <Button type="primary" :loading="kyb.busy" :disabled="!kybRef" @click="submitKyb">
              {{ $t('intafaced.pay.submitKyb') }}
            </Button>
          </div>
        </div>

        <div v-if="kyb.ran" style="margin-bottom:16px;">
          <div v-if="kyb.reason === 'ok'" class="ix-done">
            <strong>{{ $t('intafaced.pay.kybSubmitted') }}</strong>
            <div style="margin-top:6px;">{{ $t('intafaced.pay.kybStatus') }}: {{ kyb.data.kybStatus }}</div>
          </div>
          <IxState v-else :loading="kyb.busy" :reason="kyb.reason" :message="kyb.message" endpoint="/api/pay/trpc/merchant.submitKyb"></IxState>
        </div>

        <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
          <strong>{{ $t('intafaced.pay.merchantPage.stubTitle') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.pay.merchantPage.stubBody') }}</div>
        </div>
        <div class="ix-actions">
          <Button size="small" :loading="decided.busy" @click="decideKyb('approved')">{{ $t('intafaced.pay.stubApprove') }}</Button>
          <Button size="small" :loading="decided.busy" @click="decideKyb('rejected')">{{ $t('intafaced.pay.stubReject') }}</Button>
        </div>

        <div v-if="decided.ran" style="margin-top:14px;">
          <div v-if="decided.reason === 'ok'" class="ix-done">
            <strong>{{ $t('intafaced.pay.kybDecided') }}</strong>
            <div style="margin-top:6px;">{{ $t('intafaced.pay.kybStatus') }}: {{ decided.data.kybStatus }}</div>
          </div>
          <IxState v-else :loading="decided.busy" :reason="decided.reason" :message="decided.message" endpoint="/api/pay/trpc/merchant.decideKybStub"></IxState>
        </div>
      </div>

      <!-- ── what we owe, and what is already spendable ──────────────────── -->
      <div class="ix-card">
        <div class="ix-card-head">
          <h2>{{ $t('intafaced.pay.balancesTitle') }}</h2>
          <span class="ix-sub">merchant.balances</span>
        </div>
        <p class="ix-lead">{{ $t('intafaced.pay.merchantPage.balancesLead') }}</p>
        <div class="ix-form-row" style="margin-bottom:16px;">
          <div class="ix-field">
            <label for="ix-mb-asset">{{ $t('intafaced.pay.asset') }}</label>
            <Input element-id="ix-mb-asset" v-model="balanceAsset" :placeholder="$t('intafaced.bank.assetHint')" @on-enter="loadBalances"></Input>
          </div>
          <div class="ix-form-action">
            <Button @click="loadBalances">{{ $t('intafaced.pay.check') }}</Button>
          </div>
        </div>
        <IxState :loading="balances.loading" :reason="balances.reason" :message="balances.message" endpoint="/api/pay/trpc/merchant.balances">
          <div v-if="balances.data" class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.clearing') }} · {{ balanceAsset }}</span>
              <span class="v">{{ balances.data.clearing }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.available') }} · {{ balanceAsset }}</span>
              <span class="v">{{ balances.data.available }}</span>
            </div>
          </div>
        </IxState>
      </div>

      <!-- ── checkout profile ───────────────────────────────────────────── -->
      <div class="ix-card">
        <div class="ix-card-head">
          <h2>{{ $t('intafaced.pay.profileTitle') }}</h2>
          <span class="ix-sub">merchant.profile</span>
        </div>
        <p class="ix-lead">{{ $t('intafaced.pay.merchantPage.profileLead') }}</p>
        <div class="ix-form-row" style="margin-bottom:16px;">
          <div class="ix-field">
            <label for="ix-mp-domains">{{ $t('intafaced.pay.domains') }}</label>
            <Input element-id="ix-mp-domains" v-model="domains" :placeholder="$t('intafaced.pay.domainsHint')"></Input>
          </div>
          <div class="ix-form-action">
            <Button type="primary" :loading="profile.busy" :disabled="!domainList.length" @click="submitProfile">
              {{ $t('intafaced.pay.createProfile') }}
            </Button>
          </div>
        </div>

        <div v-if="profile.ran">
          <div v-if="profile.reason === 'ok'" class="ix-done">
            <strong>{{ $t('intafaced.pay.profileCreated') }}</strong>
            <div style="margin-top:6px;">{{ profile.data.id }}</div>
          </div>
          <IxState v-else :loading="profile.busy" :reason="profile.reason" :message="profile.message" endpoint="/api/pay/trpc/merchant.profile"></IxState>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
/**
 * MERCHANT — svc-pay's `merchant` router, minus the link surface (its own
 * screen) and the balances of somebody else (there is no such call).
 *
 * ── ONE MERCHANT PER ACCOUNT, SO THERE IS NO PICKER ───────────────────────
 * `pay.merchants` inserts `ON CONFLICT (user_id) DO NOTHING`, so a session has
 * exactly one merchant or none. `merchant.me` answering `null` is a 200, not a
 * refusal, and the create card is drawn only in that case: offering "create a
 * merchant" to an account that already has one would produce a refusal the
 * reader could not have avoided.
 *
 * ── `decideKybStub` IS LABELLED AS A STUB, LOUDLY ─────────────────────────
 * The router allows it only where the deployment's value-movement posture is
 * allow-sandbox, and refuses with `pay.kyb_operator_required` otherwise. Both
 * buttons are drawn with that stated above them, because the refusal IS the
 * product answer on a live posture — a verification anyone can approve for
 * themselves is not verification, and hiding the control would hide that this
 * deployment is a sandbox one.
 *
 * ── WHAT THE PROFILE FORM DOES NOT COLLECT ────────────────────────────────
 * `merchant.profile` also accepts `checkoutConfig` and `feeRouting`, both
 * free-form records. A textarea of raw JSON on a money-routing field is not a
 * user interface, it is a way to post a typo into fee routing, so this screen
 * sends `domains` only — the one field with a shape a form can honestly check.
 *
 * `feeBps` is an INTEGER basis-point rate, not money, and the router types it
 * as a JSON number — so it is the one field here that is parsed. No amount on
 * this screen is: `clearing` and `available` are decimal strings from the
 * ledger and are printed as they arrived.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPayMerchant',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      createForm: { mode: 'gateway', feeBps: '' },
      kybRef: '',
      balanceAsset: 'USDT',
      domains: '',
      merchant: this.emptySection(),
      balances: this.emptySection(),
      created: this.emptyAction(),
      kyb: this.emptyAction(),
      decided: this.emptyAction(),
      profile: this.emptyAction()
    };
  },
  computed: {
    merchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    },
    canCreate() {
      return /^\d+$/.test(this.createForm.feeBps);
    },
    domainList() {
      return this.domains
        .split(',')
        .map(function(d) { return d.trim(); })
        .filter(function(d) { return d.length > 0; });
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.reloadMerchant();
  },
  methods: {
    reloadMerchant() {
      var self = this;
      this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken)).then(function(res) {
        if (res.ok && res.data) self.loadBalances();
      });
    },
    submitCreate() {
      var self = this;
      if (!this.canCreate) return;
      this.act(
        'created',
        mutate(
          'pay',
          'merchant.create',
          {
            mode: this.createForm.mode,
            // A rate, in integer basis points. The router types it as a number
            // and it is not an amount — no money is parsed on this screen.
            pricing: { feeBps: parseInt(this.createForm.feeBps, 10) }
          },
          this.ixToken
        )
      ).then(function(res) {
        if (res.ok) self.reloadMerchant();
      });
    },
    submitKyb() {
      var self = this;
      if (!this.merchantId || !this.kybRef) return;
      this.act(
        'kyb',
        mutate('pay', 'merchant.submitKyb', { merchantId: this.merchantId, kybRef: this.kybRef }, this.ixToken)
      ).then(function(res) {
        if (res.ok) self.reloadMerchant();
      });
    },
    decideKyb(decision) {
      var self = this;
      if (!this.merchantId) return;
      this.act(
        'decided',
        mutate('pay', 'merchant.decideKybStub', { merchantId: this.merchantId, decision: decision }, this.ixToken)
      ).then(function(res) {
        if (res.ok) self.reloadMerchant();
      });
    },
    loadBalances() {
      if (!this.merchantId || !this.balanceAsset) return;
      this.load(
        'balances',
        query('pay', 'merchant.balances', { merchantId: this.merchantId, assetId: this.balanceAsset }, this.ixToken)
      );
    },
    submitProfile() {
      if (!this.merchantId || !this.domainList.length) return;
      this.act('profile', mutate('pay', 'merchant.profile', { merchantId: this.merchantId, domains: this.domainList }, this.ixToken));
    }
  }
};
</script>
