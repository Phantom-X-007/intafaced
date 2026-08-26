<template>
  <div class="ix-page bank-page pay-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.settlementsPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.settlementsPage.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-pay · settlement.run · settlement.get · settlement.payout · settlement.release</code></details>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <!-- There is no `settlement.list` on svc-pay. Saying so is the only honest
         way to explain why this screen asks for a window or an id rather than
         drawing a table nobody can populate. -->
    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.pay.settlementsPage.noListTitle') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.pay.settlementsPage.noListBody') }}</div>
    </div>

    <IxState compact :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
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
            <IxState compact v-else :loading="ran.busy" :reason="ran.reason" :message="ran.message" endpoint="/api/pay/trpc/settlement.run"></IxState>
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
          <IxState compact
            v-if="settlement.reason"
            :loading="settlement.loading"
            :reason="settlement.reason"
            :message="settlement.message"
            endpoint="/api/pay/trpc/settlement.get"
          ></IxState>
        </div>

        <!-- ── release a pending freeze (posts no ledger value) ────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.settlements.release') }}</h2>
            <span class="ix-sub">settlement.release</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.settlements.releaseLead') }}</p>

          <div class="ix-field-grid">
            <div class="ix-field">
              <label for="ix-rel-id">{{ $t('intafaced.pay.settlementId') }}</label>
              <Input element-id="ix-rel-id" v-model="releaseForm.settlementId" :placeholder="$t('intafaced.pay.settlementIdHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-rel-reason">{{ $t('intafaced.pay.settlements.releaseReason') }}</label>
              <Input element-id="ix-rel-reason" v-model="releaseForm.reason" :placeholder="$t('intafaced.pay.settlements.releaseReasonHint')"></Input>
            </div>
          </div>

          <div class="ix-actions">
            <Button type="primary" :loading="released.busy" :disabled="!canRelease" @click="releaseFreeze">
              {{ $t('intafaced.pay.settlements.release') }}
            </Button>
          </div>

          <div v-if="released.ran" style="margin-top:14px;">
            <div v-if="released.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.settlements.releaseDone') }}</strong>
              <div style="margin-top:6px;">
                {{ $t('intafaced.bank.status') }}: {{ released.data.status }}
              </div>
            </div>
            <IxState compact v-else :loading="released.busy" :reason="released.reason" :message="released.message" endpoint="/api/pay/trpc/settlement.release"></IxState>
          </div>
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
              <!-- Rails are only a list after health answered ok. Loading and
                   refuse are painted as themselves (IxState) — never as an
                   empty picker that reads as "zero rails". -->
              <IxState compact :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/pay/trpc/health">
                <Select v-model="payoutForm.railId" :placeholder="$t('intafaced.pay.chooseRail')">
                  <Option v-for="rail in railIds" :key="rail" :value="rail" :label="rail"></Option>
                </Select>
              </IxState>
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
            <IxState compact v-else :loading="paid.busy" :reason="paid.reason" :message="paid.message" endpoint="/api/pay/trpc/settlement.payout"></IxState>
          </div>
        </div>
      </template>
    </IxState>
  </div>
</template>

<script>
/**
 * SETTLEMENTS — svc-pay's `settlement` router: run, get, payout, release.
 *
 * ── THERE IS NO LIST, AND THE SCREEN SAYS SO RATHER THAN FAKING ONE ───────
 * svc-pay exposes `run`, `get`, `payout` and `release` and nothing this screen
 * uses to enumerate a merchant's settlements. A table is therefore impossible
 * without inventing either the rows or a procedure, so this screen closes a
 * window, looks one up by id, releases a pending freeze, and states the
 * absence at the top. That note is the honest version of a feature request; a
 * fabricated list would be the dishonest version of one.
 *
 * ── RELEASE MOVES NO LEDGER VALUE ─────────────────────────────────────────
 * `settlement.release` unsticks a pending freeze so later payments can enter a
 * window. Named refuse stays named. Amounts are not parsed here.
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
 *
 * ── THE RAIL PICKER DOES NOT TREAT A REFUSED HEALTH AS ZERO RAILS ─────────
 * `health` is loaded so `settlement.payout` can name a rail the service
 * actually has. `railIds` is unused unless `health.reason === 'ok'`; loading
 * and refuse go through IxState. An empty Select would be the lie.
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
      releaseForm: { settlementId: '', reason: '' },
      payoutForm: { railId: '', kind: '', ref: '' },
      current: null,
      merchant: this.emptySection(),
      health: this.emptySection(),
      settlement: { loading: false, reason: null, message: '', data: null },
      ran: this.emptyAction(),
      paid: this.emptyAction(),
      released: this.emptyAction()
    };
  },
  computed: {
    merchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    },
    railIds() {
      if (this.health.reason !== 'ok') return [];
      return (this.health.data && this.health.data.rails) || [];
    },
    canRun() {
      return Boolean(this.merchantId && this.runForm.window && this.runForm.assetId);
    },
    canPayout() {
      return Boolean(
        this.health.reason === 'ok' &&
          this.current &&
          this.payoutForm.railId &&
          this.payoutForm.kind &&
          this.payoutForm.ref
      );
    },
    canRelease() {
      return Boolean(this.releaseForm.settlementId && this.releaseForm.reason.trim());
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
        self.releaseForm.settlementId = res.data.id;
        self.paid = self.emptyAction();
        self.released = self.emptyAction();
      });
    },
    lookup() {
      var self = this;
      if (!this.lookupId) return;
      this.load('settlement', query('pay', 'settlement.get', { settlementId: this.lookupId }, this.ixToken)).then(function(res) {
        self.current = res.ok ? res.data : null;
        self.paid = self.emptyAction();
        self.released = self.emptyAction();
        if (res.ok) self.releaseForm.settlementId = self.lookupId;
      });
    },
    releaseFreeze() {
      var self = this;
      if (!this.canRelease) return;
      this.act(
        'released',
        mutate('pay', 'settlement.release', {
          settlementId: this.releaseForm.settlementId,
          reason: this.releaseForm.reason.trim()
        }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        if (self.current && self.current.id === res.data.id) self.current = res.data;
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
