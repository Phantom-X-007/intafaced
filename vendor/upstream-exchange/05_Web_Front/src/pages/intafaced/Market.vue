<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.market.title') }}</h1>
      <p>{{ $t('intafaced.modules.market.blurb') }}</p>
      <div class="ix-source">svc-market · /api/market/trpc</div>
    </div>
    <IxSubNav :items="nav" label-key="intafaced.market.nav.aria" />
    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">{{ $t('intafaced.modules.market.note') }}</div>

    <div class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.market.programme') }}</h2><span class="ix-sub">commerceProgramme</span></div>
      <IxState :loading="programme.loading" :reason="programme.reason" :message="programme.message" endpoint="/api/market/trpc/commerceProgramme">
        <div v-if="programme.data && programme.data.commissionConfigured" class="ix-kv">
          <div class="ix-kv-item"><span class="k">{{ $t('intafaced.market.commissionBps') }}</span><span class="v">{{ programme.data.commissionBps }}</span></div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.market.commissionUnset') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.market.listings') }}</h2><span class="ix-sub">listings</span></div>
      <IxState :loading="listings.loading" :reason="listings.reason" :message="listings.message" endpoint="/api/market/trpc/listings">
        <div v-if="listings.data && listings.data.length" class="ix-scroll">
          <table class="ix-table"><thead><tr><th>{{ $t('intafaced.market.listingTitle') }}</th><th>{{ $t('intafaced.market.assetId') }}</th><th>{{ $t('intafaced.market.price') }}</th><th>{{ $t('intafaced.market.offerType') }}</th><th></th></tr></thead>
            <tbody><tr v-for="listing in listings.data" :key="listing.id"><td>{{ listing.title }}</td><td>{{ listing.assetId }}</td><td>{{ listing.price }}</td><td>{{ listing.offerType }}</td><td><Button v-if="canBuy" size="small" :loading="purchase.busy" @click="buy(listing)">{{ $t('intafaced.market.buy') }}</Button><router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.market.signInToBuy') }}</router-link></td></tr></tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.market.empty') }}</div>
      </IxState>
      <IxState v-if="purchase.ran" :loading="purchase.busy" :reason="purchase.reason" :message="purchase.message" endpoint="/api/market/trpc/purchase">
        <div v-if="purchase.data" class="ix-note ix-note-success">{{ purchase.data.status }} · {{ purchase.data.ledgerTxId || '—' }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../config/intafaced.js';
import { MARKET_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxMarket', components: { IxState, IxSubNav }, mixins: [ixModule],
  data() { return { nav: MARKET_NAV, programme: this.emptySection(), listings: this.emptySection(), purchase: this.emptyAction() }; },
  computed: { canBuy() { return !!(this.ixToken && this.programme.data && this.programme.data.commissionConfigured); } },
  created() { this.$store.commit('navigate', 'nav-platform'); this.load('programme', query('market', 'commerceProgramme', undefined, this.ixToken)); this.load('listings', query('market', 'listings', { limit: 50 }, this.ixToken)); },
  methods: { buy(listing) { var purchaseId = this.draftId('marketPurchase:' + listing.id); if (!purchaseId) return; this.act('purchase', mutate('market', 'purchase', { listingId: listing.id, purchaseId: purchaseId }, this.ixToken)); } }
};
</script>
