<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.predict.title') }}</h1>
      <p>{{ $t('intafaced.predict.blurb') }}</p>
      <div class="ix-source">{{ $t('intafaced.predict.source') }}</div>
    </div>

    <IxState
      :loading="catalogue.loading"
      :reason="catalogue.reason"
      :message="catalogue.message"
      endpoint="/api/v1/outcomes/markets"
    >
      <div v-if="markets.length === 0" class="ix-note ix-note-quiet">
        {{ $t('intafaced.predict.empty') }}
      </div>

      <div v-else class="ix-predict-layout">
        <section class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.predict.markets') }}</h2>
            <span class="ix-sub">{{ markets.length }}</span>
          </div>
          <button
            v-for="market in markets"
            :key="market.id"
            type="button"
            class="ix-predict-market"
            :class="{ 'is-active': market.id === selectedMarketId }"
            @click="selectMarket(market.id)"
          >
            <strong>{{ market.question }}</strong>
            <span>{{ $t('intafaced.predict.closes') }} {{ market.closeAt }}</span>
            <span>{{ $t('intafaced.predict.settlementAsset') }} {{ market.settlementAssetId }}</span>
            <span>{{ $t('intafaced.predict.settlementSource') }} {{ market.settlementSource }}</span>
          </button>
        </section>

        <section class="ix-card">
          <div class="ix-card-head">
            <h2>{{ selectedMarket.question }}</h2>
            <span class="ix-sub">{{ selectedInstrument.symbol }}</span>
          </div>
          <div class="ix-side-toggle" role="group" :aria-label="$t('intafaced.predict.outcome')">
            <button
              v-for="instrument in selectedMarket.instruments"
              :key="instrument.symbol"
              type="button"
              :class="{ 'is-active': instrument.outcome === selectedOutcome }"
              :aria-pressed="instrument.outcome === selectedOutcome ? 'true' : 'false'"
              @click="selectOutcome(instrument.outcome)"
            >{{ outcomeLabel(instrument.outcome) }}</button>
          </div>

          <IxState
            :loading="book.loading"
            :reason="book.reason"
            :message="book.message"
            :endpoint="bookEndpoint"
          >
            <div v-if="bookEmpty" class="ix-note ix-note-quiet">
              {{ $t('intafaced.predict.emptyBook') }}
            </div>
            <div v-else class="ix-predict-book">
              <table class="ix-table">
                <thead><tr><th>{{ $t('intafaced.predict.bids') }}</th><th>{{ $t('intafaced.predict.amount') }}</th></tr></thead>
                <tbody><tr v-for="(row, index) in bookBids" :key="'bid-' + index"><td>{{ row.price }}</td><td>{{ row.amount }}</td></tr></tbody>
              </table>
              <table class="ix-table">
                <thead><tr><th>{{ $t('intafaced.predict.asks') }}</th><th>{{ $t('intafaced.predict.amount') }}</th></tr></thead>
                <tbody><tr v-for="(row, index) in bookAsks" :key="'ask-' + index"><td>{{ row.price }}</td><td>{{ row.amount }}</td></tr></tbody>
              </table>
            </div>
          </IxState>
        </section>

        <section class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.predict.ticket') }}</h2>
            <span class="ix-sub">{{ outcomeLabel(selectedOutcome) }}</span>
          </div>
          <div class="ix-note ix-note-quiet">{{ $t('intafaced.predict.fullCollateral') }}</div>
          <div class="ix-field">
            <label for="ix-predict-price">{{ $t('intafaced.predict.limitPrice') }}</label>
            <div class="ix-field-control">
              <input id="ix-predict-price" v-model="price" type="text" inputmode="decimal" spellcheck="false" @input="clearOrderDraft" />
            </div>
          </div>
          <div class="ix-field">
            <label for="ix-predict-amount">{{ $t('intafaced.predict.amount') }}</label>
            <div class="ix-field-control">
              <input id="ix-predict-amount" v-model="amount" type="text" inputmode="decimal" spellcheck="false" @input="clearOrderDraft" />
            </div>
          </div>
          <button type="button" class="ix-submit is-buy" :disabled="order.busy || !selectedInstrument" @click="submitOrder">
            {{ order.busy ? $t('intafaced.predict.submitting') : $t('intafaced.predict.buyOutcome', { outcome: outcomeLabel(selectedOutcome) }) }}
          </button>
          <div v-if="validationError" class="ix-note">{{ validationError }}</div>
          <IxState
            v-if="order.ran"
            :loading="order.busy"
            :reason="order.reason"
            :message="order.message"
            endpoint="/api/v1/outcomes/orders"
          >
            <div v-if="order.data" class="ix-note">
              {{ $t('intafaced.predict.accepted', { id: order.data.id, status: order.data.status }) }}
            </div>
          </IxState>
        </section>
      </div>
    </IxState>
  </div>
</template>

<script>
import IxState from '../../components/intafaced/IxState.vue';
import { rest, symbolPath } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';
import ixTrade from '../../assets/js/ix-trade.js';
import ixMoney from '../../assets/js/ix-money.js';

export default {
  name: 'IxPredict',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      catalogue: this.emptySection(),
      book: { loading: false, reason: 'ok', message: '', data: { bids: [], asks: [] } },
      selectedMarketId: '',
      selectedOutcome: 'yes',
      price: '',
      amount: '',
      validationError: '',
      order: this.emptyAction()
    };
  },
  computed: {
    markets() {
      return Array.isArray(this.catalogue.data) ? this.catalogue.data : [];
    },
    selectedMarket() {
      return this.markets.filter(row => row.id === this.selectedMarketId)[0] || null;
    },
    selectedInstrument() {
      if (!this.selectedMarket) return null;
      return this.selectedMarket.instruments.filter(row => row.outcome === this.selectedOutcome)[0] || null;
    },
    bookEndpoint() {
      return this.selectedInstrument ? '/api/v1/orderbook/' + symbolPath(this.selectedInstrument.symbol) : '/api/v1/orderbook/{outcome}';
    },
    bookBids() {
      return this.book.data && Array.isArray(this.book.data.bids) ? this.book.data.bids : [];
    },
    bookAsks() {
      return this.book.data && Array.isArray(this.book.data.asks) ? this.book.data.asks : [];
    },
    bookEmpty() {
      return this.book.reason === 'ok' && !this.book.loading && this.bookBids.length === 0 && this.bookAsks.length === 0;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-market');
    this.loadMarkets();
  },
  methods: {
    validMarkets(value) {
      const present = value => typeof value === 'string' && value.trim().length > 0;
      const outcomeMarket = row => {
        if (!row || row.kind !== 'outcome' || row.collateralization !== 'full' ||
          !present(row.id) || !present(row.question) || !present(row.closeAt) ||
          !present(row.settlementAssetId) || !present(row.settlementSource) ||
          !Array.isArray(row.instruments) || row.instruments.length !== 2) return false;
        const yes = row.instruments.filter(instrument => instrument && instrument.outcome === 'yes' && present(instrument.symbol));
        const no = row.instruments.filter(instrument => instrument && instrument.outcome === 'no' && present(instrument.symbol));
        return yes.length === 1 && no.length === 1 && yes[0].symbol !== no[0].symbol;
      };
      return Array.isArray(value) && value.every(outcomeMarket);
    },
    loadMarkets() {
      this.catalogue = this.emptySection();
      return rest('/outcomes/markets').then(res => {
        if (!res.ok) {
          this.catalogue = { loading: false, reason: res.reason, message: res.message || '', data: null };
          return;
        }
        if (!this.validMarkets(res.data)) {
          this.catalogue = { loading: false, reason: 'invalid_response', message: this.$t('intafaced.predict.invalidCatalogue'), data: null };
          return;
        }
        this.catalogue = { loading: false, reason: 'ok', message: '', data: res.data };
        if (res.data.length > 0) this.selectMarket(res.data[0].id);
      });
    },
    selectMarket(id) {
      this.selectedMarketId = id;
      this.selectedOutcome = 'yes';
      this.clearOrderDraft();
      this.loadBook();
    },
    selectOutcome(outcome) {
      if (outcome !== 'yes' && outcome !== 'no') return;
      this.selectedOutcome = outcome;
      this.clearOrderDraft();
      this.loadBook();
    },
    loadBook() {
      if (!this.selectedInstrument) return;
      this.book = { loading: true, reason: null, message: '', data: null };
      return rest('/orderbook/' + symbolPath(this.selectedInstrument.symbol), { query: { limit: 20 } }).then(res => {
        if (!res.ok) {
          this.book = { loading: false, reason: res.reason, message: res.message || '', data: null };
          return;
        }
        const gate = ixTrade.accept(ixTrade.schemas.orderBook, res.data);
        if (!gate.ok) {
          this.book = { loading: false, reason: gate.reason, message: gate.message || '', data: null };
          return;
        }
        this.book = {
          loading: false,
          reason: 'ok',
          message: '',
          data: {
            bids: ixTrade.toPlateItems(gate.data.bids),
            asks: ixTrade.toPlateItems(gate.data.asks)
          }
        };
      });
    },
    clearOrderDraft() {
      this.clearDraftId('outcomeOrder');
      this.validationError = '';
      this.order = this.emptyAction();
    },
    outcomeLabel(outcome) {
      return outcome === 'yes' ? this.$t('intafaced.predict.yes') : this.$t('intafaced.predict.no');
    },
    submitOrder() {
      if (!this.ixToken) {
        this.validationError = this.$t('intafaced.predict.signIn');
        return;
      }
      const amount = String(this.amount || '').trim();
      const price = String(this.price || '').trim();
      if (!this.selectedInstrument || !ixMoney.isPositive(amount) || !ixMoney.isPositive(price)) {
        this.validationError = this.$t('intafaced.predict.invalidOrder');
        return;
      }
      const clientOrderId = this.draftId('outcomeOrder');
      if (!clientOrderId) {
        this.validationError = this.$t('intafaced.predict.retryKeyUnavailable');
        return;
      }
      this.validationError = '';
      return this.act('order', rest('/outcomes/orders', {
        method: 'POST',
        token: this.ixToken,
        body: {
          symbol: this.selectedInstrument.symbol,
          side: 'buy',
          type: 'limit',
          amount: amount,
          price: price,
          timeInForce: 'GTC',
          clientOrderId: clientOrderId
        }
      })).then(res => {
        if (!res.ok) return;
        const gate = ixTrade.accept(ixTrade.schemas.order, res.data);
        if (!gate.ok) {
          this.order = { busy: false, ran: true, reason: gate.reason, message: gate.message || '', data: null };
          return;
        }
        this.order.data = gate.data;
        this.clearDraftId('outcomeOrder');
        this.amount = '';
        this.price = '';
        this.loadBook();
      });
    }
  }
};
</script>

<style scoped>
.ix-predict-layout { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(320px, 1.4fr) minmax(260px, 0.8fr); gap: 16px; align-items: start; }
.ix-predict-market { display: flex; width: 100%; flex-direction: column; gap: 5px; padding: 12px; border: 1px solid var(--ix-hairline); background: transparent; color: var(--ix-text); text-align: left; }
.ix-predict-market + .ix-predict-market { margin-top: 8px; }
.ix-predict-market span { color: var(--ix-text-faint); font-size: 12px; }
.ix-predict-market.is-active { border-color: var(--ix-orange); }
.ix-predict-book { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 1100px) { .ix-predict-layout { grid-template-columns: 1fr; } }
</style>
