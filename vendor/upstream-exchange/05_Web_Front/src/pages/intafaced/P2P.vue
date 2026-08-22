<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.p2p.title') }}</h1>
      <p>{{ $t('intafaced.modules.p2p.blurb') }}</p>
      <div class="ix-source">svc-p2p · /api/p2p/trpc</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.p2p.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.createOffer') }}</h2>
        <span class="ix-sub">offers.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.createOfferLead') }}</p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-create-side">{{ $t('intafaced.p2p.side') }}</label>
          <select id="ix-p2p-create-side" v-model="createForm.side">
            <option value="sell">sell</option>
            <option value="buy">buy</option>
          </select>
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-asset">{{ $t('intafaced.p2p.createOfferAsset') }}</label>
          <Input element-id="ix-p2p-create-asset" v-model="createForm.asset" :placeholder="$t('intafaced.p2p.createOfferAssetHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-fiat">{{ $t('intafaced.p2p.createOfferFiat') }}</label>
          <Input element-id="ix-p2p-create-fiat" v-model="createForm.fiatCurrency" :placeholder="$t('intafaced.p2p.createOfferFiatHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-price-type">{{ $t('intafaced.p2p.createOfferPriceType') }}</label>
          <select id="ix-p2p-create-price-type" v-model="createForm.priceType">
            <option value="fixed">fixed</option>
            <option value="float">float</option>
          </select>
        </div>
      </div>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-create-price">{{ $t('intafaced.p2p.price') }}</label>
          <Input element-id="ix-p2p-create-price" v-model="createForm.price" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-min">{{ $t('intafaced.p2p.createOfferMin') }}</label>
          <Input element-id="ix-p2p-create-min" v-model="createForm.minAmount" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-max">{{ $t('intafaced.p2p.createOfferMax') }}</label>
          <Input element-id="ix-p2p-create-max" v-model="createForm.maxAmount" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-total">{{ $t('intafaced.p2p.createOfferTotal') }}</label>
          <Input element-id="ix-p2p-create-total" v-model="createForm.totalAmount" :placeholder="$t('intafaced.p2p.createOfferTotalHint')" />
        </div>
      </div>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-create-methods">{{ $t('intafaced.p2p.createOfferMethods') }}</label>
          <Input element-id="ix-p2p-create-methods" v-model="createForm.methods" :placeholder="$t('intafaced.p2p.createOfferMethodsHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-create-terms">{{ $t('intafaced.p2p.createOfferTerms') }}</label>
          <Input element-id="ix-p2p-create-terms" v-model="createForm.terms" :placeholder="$t('intafaced.p2p.createOfferTermsHint')" />
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button
          v-if="ixToken"
          size="small"
          :loading="create.busy"
          :disabled="!canCreate"
          @click="createOffer"
        >{{ $t('intafaced.p2p.createOfferSubmit') }}</Button>
        <router-link v-else to="/platform">{{ $t('intafaced.p2p.createOfferSignIn') }}</router-link>
      </div>
      <IxState v-if="create.ran" :loading="create.busy" :reason="create.reason" :message="create.message" endpoint="/api/p2p/trpc/offers.create">
        <div v-if="create.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.createOfferDone') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.createOfferId') }}</span><span class="v">{{ create.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.side') }}</span><span class="v">{{ create.data.side }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.createOfferAsset') }}</span><span class="v">{{ create.data.asset }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.price') }}</span><span class="v">{{ create.data.price }} {{ create.data.fiatCurrency }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ create.data.status }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.offers') }}</h2>
        <span class="ix-sub">offers.list · trades.take · offers.pause · offers.resume</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.take.lead') }}</p>
      <IxState :loading="methods.loading" :reason="methods.reason" :message="methods.message" endpoint="/api/p2p/trpc/instruments.methods.list">
        <div v-if="registryEmpty" class="ix-note" style="margin-bottom:16px;">{{ $t('intafaced.p2p.take.noMethodRegistry') }}</div>
      </IxState>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-p2p-amount">{{ $t('intafaced.p2p.take.amount') }}</label>
          <Input element-id="ix-p2p-amount" v-model="takeAmount" :placeholder="$t('intafaced.p2p.take.amountHint')" />
        </div>
        <div class="ix-field">
          <label for="ix-p2p-method">{{ $t('intafaced.p2p.take.method') }}</label>
          <Input element-id="ix-p2p-method" v-model="takeMethod" :placeholder="$t('intafaced.p2p.take.methodHint')" />
        </div>
      </div>
      <IxState :loading="offers.loading" :reason="offers.reason" :message="offers.message" endpoint="/api/p2p/trpc/offers.list">
        <div v-if="offers.data && offers.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.side') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.p2p.price') }}</th>
                <th>{{ $t('intafaced.p2p.limits') }}</th>
                <th>{{ $t('intafaced.p2p.take.method') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in offers.data" :key="o.id">
                <td :style="{ color: o.side === 'buy' ? 'var(--ix-up)' : 'var(--ix-down)' }">{{ o.side }}</td>
                <td>{{ o.asset }}</td>
                <td>{{ o.price }} {{ o.fiatCurrency }}</td>
                <td>{{ o.minAmount }} – {{ o.maxAmount }}</td>
                <td>{{ methodIds(o) }}</td>
                <td>{{ o.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button
                      v-if="ixToken && canPause(o)"
                      size="small"
                      :loading="pause.busy && pauseId === o.id"
                      @click="pauseOffer(o)"
                    >{{ $t('intafaced.p2p.pause') }}</Button>
                    <Button
                      v-if="ixToken && canResume(o)"
                      size="small"
                      :loading="pause.busy && pauseId === o.id"
                      @click="resumeOffer(o)"
                    >{{ $t('intafaced.p2p.resume') }}</Button>
                    <Button
                      v-if="ixToken"
                      size="small"
                      :loading="take.busy && takingId === o.id"
                      :disabled="!canTake"
                      @click="takeOffer(o)"
                    >{{ $t('intafaced.p2p.take.action') }}</Button>
                    <router-link v-else to="/platform">{{ $t('intafaced.p2p.take.signIn') }}</router-link>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
      <IxState v-if="pause.ran" :loading="pause.busy" :reason="pause.reason" :message="pause.message" :endpoint="pauseEndpoint">
        <div v-if="pause.data" class="ix-done">
          <strong>{{ pauseDoneLabel }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.createOfferId') }}</span><span class="v">{{ pause.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.bank.status') }}</span><span class="v">{{ pause.data.status }}</span></div>
          </div>
        </div>
      </IxState>
      <IxState v-if="take.ran" :loading="take.busy" :reason="take.reason" :message="take.message" endpoint="/api/p2p/trpc/trades.take">
        <div v-if="take.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.take.done') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ take.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.status') }}</span><span class="v">{{ take.data.status }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.amount') }}</span><span class="v">{{ take.data.amount }} {{ take.data.asset }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.fiatAmount') }}</span><span class="v">{{ take.data.fiatAmount }} {{ take.data.fiatCurrency }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.method') }}</span><span class="v">{{ take.data.method }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.trades.title') }}</h2>
        <span class="ix-sub">trades.list</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.p2p.trades.lead') }}</p>
      <IxState :loading="trades.loading" :reason="trades.reason" :message="trades.message" endpoint="/api/p2p/trpc/trades.list">
        <div v-if="trades.data && trades.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.take.tradeId') }}</th>
                <th>{{ $t('intafaced.p2p.take.status') }}</th>
                <th>{{ $t('intafaced.p2p.take.amount') }}</th>
                <th>{{ $t('intafaced.p2p.take.fiatAmount') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in trades.data" :key="t.id">
                <td>{{ t.id }}</td>
                <td>{{ t.status }}</td>
                <td>{{ t.amount }} {{ t.asset }}</td>
                <td>{{ t.fiatAmount }} {{ t.fiatCurrency }}</td>
                <td>
                  <div class="ix-actions">
                    <Button v-if="canMarkSent(t)" size="small" :loading="lifecycle.busy && lifeId === t.id" @click="markFiatSent(t)">{{ $t('intafaced.p2p.trades.markSent') }}</Button>
                    <Button v-if="canConfirm(t)" size="small" :loading="lifecycle.busy && lifeId === t.id" @click="confirmReceived(t)">{{ $t('intafaced.p2p.trades.confirm') }}</Button>
                    <Button v-if="canCancel(t)" size="small" :loading="lifecycle.busy && lifeId === t.id" @click="cancelTrade(t)">{{ $t('intafaced.p2p.trades.cancel') }}</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.p2p.trades.empty') }}</div>
      </IxState>
      <IxState v-if="lifecycle.ran" :loading="lifecycle.busy" :reason="lifecycle.reason" :message="lifecycle.message" :endpoint="lifeEndpoint">
        <div v-if="lifecycle.data" class="ix-done">
          <strong>{{ $t('intafaced.p2p.trades.updated') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.tradeId') }}</span><span class="v">{{ lifecycle.data.id }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.p2p.take.status') }}</span><span class="v">{{ lifecycle.data.status }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.fiat') }}</h2>
        <span class="ix-sub">fiat.list</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.p2p.fiatLead') }}
      </p>
      <IxState :loading="fiat.loading" :reason="fiat.reason" :message="fiat.message" endpoint="/api/p2p/trpc/fiat.list">
        <div v-if="fiat.data && fiat.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.code') }}</th>
                <th>{{ $t('intafaced.p2p.name') }}</th>
                <th>{{ $t('intafaced.p2p.symbol') }}</th>
                <th>{{ $t('intafaced.p2p.minorUnits') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in fiat.data" :key="f.code">
                <td>{{ f.code }}</td>
                <td>{{ f.name }}</td>
                <td>{{ f.symbol }}</td>
                <td>{{ f.minorUnits }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-p2p (§6.2).
 *
 * `fiat.list` is a `publicProcedure` and returns the real enabled-currency
 * table — the one honest, unauthenticated read this module has today.
 *
 * `offers.list` is different in an instructive way. The scope it wants,
 * `p2p:read`, IS issued to an interactive session, so this is not the scope
 * gap that stops svc-bank. It is the jurisdiction matrix: the module demands
 * verification tier "basic" and a fresh account is tier "none". That refusal is
 * policy working, so it is shown as the service worded it rather than softened
 * into "no offers found".
 *
 * Take posts {offerId, amount, method} as the router takes them. Amount stays a
 * decimal string. This screen never posts a lock and never invents a rail.
 *
 * Create posts {side, asset, fiatCurrency, priceType, price, minAmount,
 * maxAmount, methods} the same way. Optional totalAmount and terms are omitted
 * when blank. Amounts stay decimal strings. methods are non-empty string ids.
 *
 * Pause and resume post {offerId} on the caller's own row. They do not move
 * escrow. Named refuse stays named.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate, subjectOf } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxP2P',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      offers: this.emptySection(),
      fiat: this.emptySection(),
      methods: this.emptySection(),
      take: this.emptyAction(),
      create: this.emptyAction(),
      pause: this.emptyAction(),
      trades: this.emptySection(),
      lifecycle: this.emptyAction(),
      takeAmount: '',
      takeMethod: '',
      takingId: '',
      pauseId: '',
      pauseEndpoint: '/api/p2p/trpc/offers.pause',
      lifeId: '',
      lifeEndpoint: '/api/p2p/trpc/trades.list',
      createForm: {
        side: 'sell',
        asset: '',
        fiatCurrency: '',
        priceType: 'fixed',
        price: '',
        minAmount: '',
        maxAmount: '',
        totalAmount: '',
        methods: '',
        terms: ''
      }
    };
  },
  computed: {
    registryEmpty() {
      return this.methods.reason === 'ok' && Array.isArray(this.methods.data) && this.methods.data.length === 0;
    },
    canTake() {
      return !!(this.takeAmount && this.takeMethod && !this.take.busy);
    },
    createMethodIds() {
      return (this.createForm.methods || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
    },
    canCreate() {
      var f = this.createForm;
      return !!(
        f.side &&
        f.priceType &&
        (f.asset || '').trim() &&
        (f.fiatCurrency || '').trim() &&
        (f.price || '').trim() &&
        (f.minAmount || '').trim() &&
        (f.maxAmount || '').trim() &&
        this.createMethodIds.length &&
        !this.create.busy
      );
    },
    myId() {
      return subjectOf(this.ixToken);
    },
    pauseDoneLabel() {
      return this.pauseEndpoint.indexOf('offers.resume') !== -1
        ? this.$t('intafaced.p2p.resumeDone')
        : this.$t('intafaced.p2p.pauseDone');
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('offers', query('p2p', 'offers.list', undefined, this.ixToken));
    this.load('fiat', query('p2p', 'fiat.list', undefined, this.ixToken));
    this.load('methods', query('p2p', 'instruments.methods.list', undefined, this.ixToken));
    this.loadTrades();
  },
  methods: {
    methodIds(offer) {
      var out = [];
      var methods = offer && offer.methods;
      if (!methods || !methods.length) return '';
      for (var i = 0; i < methods.length; i++) {
        var x = methods[i];
        if (typeof x === 'string' && x) out.push(x);
        else if (x && typeof x.id === 'string' && x.id) out.push(x.id);
      }
      return out.join(', ');
    },
    isMine(offer) {
      return !!(offer && this.myId && offer.makerId === this.myId);
    },
    canPause(offer) {
      return this.isMine(offer) && offer.status === 'active';
    },
    canResume(offer) {
      return this.isMine(offer) && offer.status === 'paused';
    },
    keepOffer(offer, status, data) {
      var rows = (this.offers.data || []).slice();
      var next = Object.assign({}, offer, data || {}, { status: (data && data.status) || status });
      var found = false;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === offer.id) {
          rows[i] = next;
          found = true;
          break;
        }
      }
      if (!found) rows.unshift(next);
      this.offers.data = rows;
    },
    pauseOffer(offer) {
      var self = this;
      if (!offer || this.pause.busy) return;
      this.pauseId = offer.id;
      this.pauseEndpoint = '/api/p2p/trpc/offers.pause';
      this.act('pause', mutate('p2p', 'offers.pause', { offerId: offer.id }, this.ixToken)).then(function (res) {
        self.pauseId = '';
        if (res.ok) self.keepOffer(offer, 'paused', res.data);
      });
    },
    resumeOffer(offer) {
      var self = this;
      if (!offer || this.pause.busy) return;
      this.pauseId = offer.id;
      this.pauseEndpoint = '/api/p2p/trpc/offers.resume';
      this.act('pause', mutate('p2p', 'offers.resume', { offerId: offer.id }, this.ixToken)).then(function (res) {
        self.pauseId = '';
        if (res.ok) {
          self.keepOffer(offer, 'active', res.data);
          self.load('offers', query('p2p', 'offers.list', undefined, self.ixToken));
        }
      });
    },
    takeOffer(offer) {
      var self = this;
      if (!this.canTake || !offer) return;
      this.takingId = offer.id;
      this.act(
        'take',
        mutate('p2p', 'trades.take', { offerId: offer.id, amount: this.takeAmount, method: this.takeMethod }, this.ixToken)
      ).then(function () {
        self.takingId = '';
        self.loadTrades();
      });
    },
    createOffer() {
      var self = this;
      if (!this.canCreate) return;
      var f = this.createForm;
      var methods = this.createMethodIds;
      if (!methods.length) return;
      var input = {
        side: f.side,
        asset: (f.asset || '').trim().toUpperCase(),
        fiatCurrency: (f.fiatCurrency || '').trim().toUpperCase(),
        priceType: f.priceType,
        price: (f.price || '').trim(),
        minAmount: (f.minAmount || '').trim(),
        maxAmount: (f.maxAmount || '').trim(),
        methods: methods
      };
      var totalAmount = (f.totalAmount || '').trim();
      if (totalAmount) input.totalAmount = totalAmount;
      var terms = (f.terms || '').trim();
      if (terms) input.terms = terms;
      this.act('create', mutate('p2p', 'offers.create', input, this.ixToken)).then(function (res) {
        if (res.ok) {
          self.load('offers', query('p2p', 'offers.list', undefined, self.ixToken));
        }
      });
    },
    loadTrades() {
      this.load('trades', query('p2p', 'trades.list', { limit: 50 }, this.ixToken));
    },
    canMarkSent(trade) {
      return !!(trade && this.myId && trade.status === 'escrowed' && trade.buyerId === this.myId);
    },
    canConfirm(trade) {
      return !!(trade && this.myId && trade.status === 'fiat_sent' && trade.sellerId === this.myId);
    },
    canCancel(trade) {
      if (!trade || !this.myId) return false;
      if (trade.status === 'escrowed' && (trade.buyerId === this.myId || trade.sellerId === this.myId)) return true;
      return trade.status === 'fiat_sent' && trade.sellerId === this.myId;
    },
    runLifecycle(procedure, trade) {
      var self = this;
      if (this.lifecycle.busy || !trade) return;
      this.lifeId = trade.id;
      this.lifeEndpoint = '/api/p2p/trpc/' + procedure;
      this.act('lifecycle', mutate('p2p', procedure, { tradeId: trade.id }, this.ixToken)).then(function () {
        self.lifeId = '';
        self.loadTrades();
      });
    },
    markFiatSent(trade) {
      this.runLifecycle('trades.markFiatSent', trade);
    },
    confirmReceived(trade) {
      this.runLifecycle('trades.confirmReceived', trade);
    },
    cancelTrade(trade) {
      this.runLifecycle('trades.cancel', trade);
    }
  }
};
</script>
