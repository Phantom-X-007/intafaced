<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.settlementsPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.settlementsPage.lead') }}</p>
      <div class="ix-source">svc-pay · settlement.run · settlement.get · settlement.payout</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <!-- There is no `settlement.list` on svc-pay. Saying so is the only honest
         way to explain why this screen asks for a window or an id rather than
         drawing a table nobody can populate. -->
    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.pay.settlementsPage.noListTitle') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.pay.settlementsPage.noListBody') }}</div>
    </div>

    <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
      <div v-if="!merchantId" class="ix-note ix-note-quiet">
        {{ $t('intafaced.pay.linksPage.needMerchant') }}
        <div class="ix-actions" style="margin-top:12px;">
          <router-link to="/pay/merchant">
            <Button size="small">{{ $t('intafaced.pay.overview.openMerchant') }}</Button>
          </router-link>
        </div>
      </div>

      <template v-else>
        <!-- ── close a window ─────────────────────────────────────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.runSettlement') }}</h2>
            <span class="ix-sub">settlement.run</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.settlementsPage.runLead') }}</p>

          <div class="ix-field-grid">
            <div class="ix-field">
              <label for="ix-st-window">{{ $t('intafaced.pay.window') }}</label>
              <Input element-id="ix-st-window" v-model="runForm.window" :placeholder="$t('intafaced.pay.windowHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-st-asset">{{ $t('intafaced.pay.asset') }}</label>
              <Input element-id="ix-st-asset" v-model="runForm.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
            </div>
          </div>

          <div class="ix-actions">
            <Button type="primary" :loading="ran.busy" :disabled="!canRun" @click="runWindow">
              {{ $t('intafaced.pay.runSettlement') }}
            </Button>
          </div>

          <div v-if="ran.ran" style="margin-top:14px;">
            <div v-if="ran.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.settlementPosted') }}</strong>
              <div style="margin-top:6px;">{{ ran.data.id }}</div>
            </div>
            <IxState v-else :loading="ran.busy" :reason="ran.reason" :message="ran.message" endpoint="/api/pay/trpc/settlement.run"></IxState>
          </div>
        </div>

        <!-- ── look one up ────────────────────────────────────────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.findSettlement') }}</h2>
            <span class="ix-sub">settlement.get</span>
          </div>
          <div class="ix-form-row" style="margin-bottom:16px;">
            <div class="ix-field">
              <label for="ix-st-id">{{ $t('intafaced.pay.settlementId') }}</label>
              <Input element-id="ix-st-id" v-model="lookupId" :placeholder="$t('intafaced.pay.settlementIdHint')" @on-enter="lookup"></Input>
            </div>
            <div class="ix-form-action">
              <Button :disabled="!lookupId" @click="lookup">{{ $t('intafaced.pay.check') }}</Button>
            </div>
          </div>
          <IxState
            v-if="settlement.reason"
            :loading="settlement.loading"
            :reason="settlement.reason"
            :message="settlement.message"
            endpoint="/api/pay/trpc/settlement.get"
          ></IxState>
        </div>

        <!-- ── the settlement in hand, and paying it out ───────────────── -->
        <div v-if="current" class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.settlementDetail') }}</h2>
            <span class="ix-sub">settlement.payout</span>
          </div>

          <div class="ix-kv" style="margin-bottom:18px;">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.window') }}</span>
              <span class="v">{{ current.window }} · {{ current.assetId }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.gross') }}</span>
              <span class="v">{{ current.gross }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.fees') }}</span>
              <span class="v">{{ current.fees }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.net') }}</span>
              <span class="v">{{ current.net }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.status') }}</span>
              <span class="v">{{ current.status }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.payoutRef') }}</span>
              <span class="v" style="font-size:13px;">{{ current.payoutRef === null ? '—' : current.payoutRef }}</span>
            </div>
          </div>

          <p class="ix-lead">{{ $t('intafaced.pay.settlementsPage.payoutLead') }}</p>

          <div class="ix-field-grid">
            <div class="ix-field">
              <label>{{ $t('intafaced.pay.rail') }}</label>
              <Select v-model="payoutForm.railId" :placeholder="$t('intafaced.pay.chooseRail')">
                <Option v-for="rail in railIds" :key="rail" :value="rail" :label="rail"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label for="ix-po-kind">{{ $t('intafaced.pay.destinationKind') }}</label>
              <Input element-id="ix-po-kind" v-model="payoutForm.kind" :placeholder="$t('intafaced.pay.destinationKindHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-po-ref">{{ $t('intafaced.pay.destinationRef') }}</label>
              <Input element-id="ix-po-ref" v-model="payoutForm.ref" :placeholder="$t('intafaced.pay.destinationRefHint')"></Input>
            </div>
          </div>

          <div class="ix-actions">
            <Button type="primary" :loading="paid.busy" :disabled="!canPayout" @click="payout">
              {{ $t('intafaced.pay.payout') }}
            </Button>
          </div>

          <div v-if="paid.ran" style="margin-top:14px;">
            <div v-if="paid.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.payoutSent') }}</strong>
              <div style="margin-top:6px;">
                {{ $t('intafaced.bank.status') }}: {{ paid.data.status }} ·
                {{ $t('intafaced.pay.payoutRef') }}: {{ paid.data.payoutRef === null ? '—' : paid.data.payoutRef }}
              </div>
            </div>
            <IxState v-else :loading="paid.busy" :reason="paid.reason" :message="paid.message" endpoint="/api/pay/trpc/settlement.payout"></IxState>
          </div>
        </div>
      </template>
    </IxState>
  </div>
</template>

<script>
/**
 * SETTLEMENTS — svc-pay's `settlement` router, all three procedures.
 *
 * ── THERE IS NO LIST, AND THE SCREEN SAYS SO RATHER THAN FAKING ONE ───────
 * svc-pay exposes `run`, `get` and `payout` and nothing that enumerates a
 * merchant's settlements. A table is therefore impossible without inventing
 * either the rows or a procedure, so this screen closes a window, looks one up
 * by id, and states the absence at the top. That note is the honest version of
 * a feature request; a fabricated list would be the dishonest version of one.
 *
 * ── PAYOUT CARRIES ITS OWN SCOPE BECAUSE VALUE LEAVES THE BOOK ────────────
 * `pay:payout`, separate from `pay:write` — "value leaves the book here". A
 * session that can close a window may still be refused the payout, and that
 * refusal is rendered by name rather than as a failed button.
 *
 * ── GROSS, FEES AND NET ARE svc-pay's, NOT THIS SCREEN'S ──────────────────
 * All three are decimal strings and all three are printed as they arrived.
 * Nothing here checks that gross − fees = net. It would have to parse three
 * amounts to do it, and a browser that disagreed with the ledger about a
 * merchant's revenue would be the number the merchant believed.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPaySettlements',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      runForm: { window: '', assetId: 'USDT' },
      lookupId: '',
      payoutForm: { railId: '', kind: '', ref: '' },
      current: null,
      merchant: this.emptySection(),
      health: this.emptySection(),
      settlement: { loading: false, reason: null, message: '', data: null },
      ran: this.emptyAction(),
      paid: this.emptyAction()
    };
  },
  computed: {
    merchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    },
    railIds() {
      return (this.health.data && this.health.data.rails) || [];
    },
    canRun() {
      return Boolean(this.merchantId && this.runForm.window && this.runForm.assetId);
    },
    canPayout() {
      return Boolean(this.current && this.payoutForm.railId && this.payoutForm.kind && this.payoutForm.ref);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken));
  },
  methods: {
    runWindow() {
      var self = this;
      if (!this.canRun) return;
      this.act(
        'ran',
        mutate(
          'pay',
          'settlement.run',
          { merchantId: this.merchantId, window: this.runForm.window, assetId: this.runForm.assetId },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.current = res.data;
        self.lookupId = res.data.id;
        self.paid = self.emptyAction();
      });
    },
    lookup() {
      var self = this;
      if (!this.lookupId) return;
      this.load('settlement', query('pay', 'settlement.get', { settlementId: this.lookupId }, this.ixToken)).then(function(res) {
        self.current = res.ok ? res.data : null;
        self.paid = self.emptyAction();
      });
    },
    payout() {
      var self = this;
      if (!this.canPayout) return;
      this.act(
        'paid',
        mutate(
          'pay',
          'settlement.payout',
          {
            settlementId: this.current.id,
            railId: this.payoutForm.railId,
            destination: { kind: this.payoutForm.kind, ref: this.payoutForm.ref }
          },
          this.ixToken
        )
      ).then(function(res) {
        if (res.ok) self.current = res.data;
      });
    }
  }
};
</script>
