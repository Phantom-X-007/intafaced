<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.market.title') }}</h1>
      <p>{{ $t('intafaced.modules.market.blurb') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-market · /api/market/trpc</code></details>
    </div>
    <IxSubNav :items="nav" label-key="intafaced.market.nav.aria" />
    <IxWorkspace :sections="{ programme, listings }" label="Marketplace">
    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">{{ $t('intafaced.modules.market.note') }}</div>

    <div id="market-listings" class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.market.listings') }}</h2><span class="ix-sub">listings</span></div>
      <IxState compact :loading="listings.loading" :reason="listings.reason" :message="listings.message" endpoint="/api/market/trpc/listings">
        <div v-if="listings.data && listings.data.length" class="ix-scroll">
          <table class="ix-table"><thead><tr><th>{{ $t('intafaced.market.listingTitle') }}</th><th>{{ $t('intafaced.market.assetId') }}</th><th>{{ $t('intafaced.market.price') }}</th><th>{{ $t('intafaced.market.offerType') }}</th><th></th></tr></thead>
            <tbody><tr v-for="listing in listings.data" :key="listing.id"><td>{{ listing.title }}</td><td>{{ listing.assetId }}</td><td>{{ listing.price }}</td><td>{{ listing.offerType }}</td><td><Button v-if="canBuy" size="small" :loading="purchase.busy" @click="buy(listing)">{{ $t('intafaced.market.buy') }}</Button><router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.market.signInToBuy') }}</router-link> <Button size="small" :loading="subscribe.busy" @click="subscribeTo(listing)">{{ $t('intafaced.market.subscribe') }}</Button></td></tr></tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.market.empty') }}</div>
      </IxState>
      <IxState compact v-if="purchase.ran" :loading="purchase.busy" :reason="purchase.reason" :message="purchase.message" endpoint="/api/market/trpc/purchase">
        <div v-if="purchase.data" class="ix-note ix-note-success">{{ purchase.data.status }} · {{ purchase.data.ledgerTxId || '—' }}</div>
      </IxState>
      <IxState compact v-if="subscribe.ran" :loading="subscribe.busy" :reason="subscribe.reason" :message="subscribe.message" endpoint="/api/market/trpc/subscribe">
        <div v-if="subscribe.data" class="ix-note ix-note-success">{{ subscribe.data.status || '—' }}</div>
      </IxState>
    </div>
    <details id="market-programme" class="ix-card market-tools">
      <summary class="ix-card-head"><h2>{{ $t('intafaced.market.programme') }}</h2><span class="ix-sub">commerceProgramme</span></summary>
      <IxState compact :loading="programme.loading" :reason="programme.reason" :message="programme.message" endpoint="/api/market/trpc/commerceProgramme">
        <div v-if="programme.data && programme.data.commissionConfigured" class="ix-kv">
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.market.commissionBps') }}</span><span class="v">{{ programme.data.commissionBps }}</span></div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.market.commissionUnset') }}</div>
      </IxState>
    </details>

    <details id="market-proposal" class="ix-card market-tools">
      <summary class="ix-card-head"><h2>{{ $t('intafaced.market.perpProposal') }}</h2><span class="ix-sub">proposePerpMarket</span></summary>
      <p class="ix-note ix-note-quiet">{{ $t('intafaced.market.perpProposalLead') }}</p>
      <div class="ix-form">
        <label>{{ $t('intafaced.market.perpSymbol') }} <Input v-model="perpForm.symbol" /></label>
        <label>{{ $t('intafaced.market.perpSettle') }} <Input v-model="perpForm.settle" /></label>
        <label>{{ $t('intafaced.market.perpOracleSource') }} <Input v-model="perpForm.oracleSource" /></label>
        <label>{{ $t('intafaced.market.perpLeverageCap') }} <Input v-model="perpForm.leverageCap" :placeholder="$t('intafaced.market.perpLeverageHint')" /></label>
        <Button type="primary" :loading="perpProposal.busy" @click="proposePerp">{{ $t('intafaced.market.perpPropose') }}</Button>
      </div>
      <IxState compact v-if="perpProposal.ran" :loading="perpProposal.busy" :reason="perpProposal.reason" :message="perpProposal.message" endpoint="/api/market/trpc/proposePerpMarket">
        <div v-if="perpProposal.data" class="ix-note ix-note-success">{{ $t('intafaced.market.perpProposed') }} · {{ perpProposal.data.status }} · orderable: {{ perpProposal.data.orderable }}</div>
      </IxState>
    </details>

    </IxWorkspace>
  </div>
</template>

<script>
import IxWorkspace from '../../components/intafaced/IxWorkspace.vue';
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../config/intafaced.js';
import { MARKET_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxMarket', components: { IxWorkspace, IxState, IxSubNav }, mixins: [ixModule],
  data() { return { nav: MARKET_NAV, programme: this.emptySection(), listings: this.emptySection(), purchase: this.emptyAction(), subscribe: this.emptyAction(), perpForm: { symbol: '', settle: '', oracleSource: '', leverageCap: '' }, perpProposal: this.emptyAction() }; },
  computed: { canBuy() { return !!(this.ixToken && this.programme.data && this.programme.data.commissionConfigured); } },
  created() { this.$store.commit('navigate', 'nav-platform'); this.load('programme', query('market', 'commerceProgramme', undefined, this.ixToken)); this.load('listings', query('market', 'listings', { limit: 50 }, this.ixToken)); },
  methods: {
    proposePerp() {
      var clientProposalId = this.draftId('marketPerpProposal');
      if (!clientProposalId) return;
      var self = this;
      this.act('perpProposal', mutate('market', 'proposePerpMarket', { clientProposalId: clientProposalId, symbol: this.perpForm.symbol, settle: this.perpForm.settle, oracleSource: this.perpForm.oracleSource, leverageCap: this.perpForm.leverageCap }, this.ixToken)).then(function(res) {
        if (res.ok) self.clearDraftId('marketPerpProposal');
      });
    },
    buy(listing) { var purchaseId = this.draftId('marketPurchase:' + listing.id); if (!purchaseId) return; this.act('purchase', mutate('market', 'purchase', { listingId: listing.id, purchaseId: purchaseId }, this.ixToken)); },
    subscribeTo(listing) { this.act('subscribe', mutate('market', 'subscribe', { listingId: listing.id }, this.ixToken)); }
  }
};
</script>

<style scoped>
.platform-module-page /deep/ .ix-card {
  margin: 0;
  padding: 16px 0;
  background: #000;
  border: 0;
  border-top: 1px solid #282828;
  border-radius: 0;
  box-shadow: none;
}
.platform-module-page /deep/ .ix-note { padding: 8px 0; background: #000; border: 0; }
.platform-module-page /deep/ details.ix-card { padding: 0; }
.market-tools > summary {
  display: list-item;
  min-height: 44px;
  padding: 12px 0;
  margin: 0;
  color: #ccc;
  cursor: pointer;
}
.market-tools > summary h2 { display: inline; font-size: 13px; }
.market-tools > summary:focus-visible { outline: 2px solid var(--ix-orange); outline-offset: 2px; }
.market-tools .ix-form { display: grid; gap: 12px; padding-bottom: 16px; }
.market-tools .ix-form label { display: grid; gap: 6px; }
.market-tools .ix-form .ivu-btn { justify-self: start; }
</style>
