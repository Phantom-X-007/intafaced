<template>
  <div class="ix-page">
    <div class="ix-page-head"><h1>{{ $t('intafaced.market.mine') }}</h1><p>{{ $t('intafaced.modules.market.blurb') }}</p></div>
    <IxSubNav :items="nav" label-key="intafaced.market.nav.aria" />
    <div class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.market.mine') }}</h2><span class="ix-sub">mine</span></div>
      <div v-if="!vendor.data" class="ix-form">
        <label>{{ $t('intafaced.market.displayName') }} <Input v-model="form.displayName" /></label>
        <label>{{ $t('intafaced.market.description') }} <Input v-model="form.description" type="textarea" /></label>
        <Button type="primary" :loading="apply.busy" @click="applyVendor">{{ $t('intafaced.market.apply') }}</Button>
      </div>
      <IxState v-if="apply.ran" :loading="apply.busy" :reason="apply.reason" :message="apply.message" endpoint="/api/market/trpc/applyAsVendor"><div v-if="apply.data" class="ix-note ix-note-success">{{ $t('intafaced.market.applied') }}</div></IxState>
      <IxState :loading="vendor.loading" :reason="vendor.reason" :message="vendor.message" endpoint="/api/market/trpc/mine"><div v-if="vendor.data" class="ix-kv"><div class="ix-kv-item"><span class="k">{{ $t('intafaced.market.displayName') }}</span><span class="v">{{ vendor.data.displayName }}</span></div><div class="ix-kv-item"><span class="k">status</span><span class="v">{{ vendor.data.status }}</span></div></div></IxState>
    </div>
    <div class="ix-card">
      <div class="ix-card-head"><h2>{{ $t('intafaced.market.createListing') }}</h2><span class="ix-sub">createListing</span></div>
      <div class="ix-form">
        <label>{{ $t('intafaced.market.listingTitle') }} <Input v-model="listing.title" /></label>
        <label>{{ $t('intafaced.market.description') }} <Input v-model="listing.description" type="textarea" /></label>
        <label>{{ $t('intafaced.market.offerType') }} <span>{{ $t('intafaced.market.createOfferTypeOneTime') }}</span></label>
        <label>{{ $t('intafaced.market.assetId') }} <Input v-model="listing.assetId" /></label>
        <label>{{ $t('intafaced.market.price') }} <Input v-model="listing.price" :placeholder="$t('intafaced.market.createPriceHint')" /></label>
        <Button type="primary" :loading="create.busy" @click="submitListing">{{ $t('intafaced.market.createListing') }}</Button>
      </div>
      <IxState v-if="create.ran" :loading="create.busy" :reason="create.reason" :message="create.message" endpoint="/api/market/trpc/createListing"><div v-if="create.data" class="ix-note ix-note-success">{{ $t('intafaced.market.createCreated') }}</div></IxState>
    </div>
    <div class="ix-card"><div class="ix-card-head"><h2>{{ $t('intafaced.market.myListings') }}</h2></div><IxState :loading="listings.loading" :reason="listings.reason" :message="listings.message" endpoint="/api/market/trpc/myListings"><div v-if="listings.data && listings.data.length" class="ix-scroll"><table class="ix-table"><thead><tr><th>{{ $t('intafaced.market.listingTitle') }}</th><th>{{ $t('intafaced.market.assetId') }}</th><th>{{ $t('intafaced.market.price') }}</th></tr></thead><tbody><tr v-for="row in listings.data" :key="row.id"><td>{{ row.title }}</td><td>{{ row.assetId }}</td><td>{{ row.price }}</td></tr></tbody></table></div><div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.market.noMine') }}</div></IxState></div>
    <div class="ix-card"><div class="ix-card-head"><h2>{{ $t('intafaced.market.myPurchases') }}</h2></div><IxState :loading="purchases.loading" :reason="purchases.reason" :message="purchases.message" endpoint="/api/market/trpc/myPurchases"><div v-if="purchases.data && purchases.data.length" class="ix-scroll"><table class="ix-table"><thead><tr><th>{{ $t('intafaced.market.listingTitle') }}</th><th>{{ $t('intafaced.market.price') }}</th><th>status</th><th>ledgerTxId</th></tr></thead><tbody><tr v-for="row in purchases.data" :key="row.id"><td>{{ row.listingId }}</td><td>{{ row.price }}</td><td>{{ row.status }}</td><td>{{ row.ledgerTxId || '—' }}</td></tr></tbody></table></div><div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.market.noMine') }}</div></IxState></div>
  </div>
</template>
<script>
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { MARKET_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
export default {
  name: 'IxMarketMine', components: { IxState, IxSubNav }, mixins: [ixModule],
  data() { return { nav: MARKET_NAV, form: { displayName: '', description: '' }, listing: { title: '', description: '', assetId: '', price: '' }, vendor: this.emptySection(), listings: this.emptySection(), purchases: this.emptySection(), apply: this.emptyAction(), create: this.emptyAction() }; },
  created() { this.$store.commit('navigate', 'nav-platform'); this.load('vendor', query('market', 'mine', undefined, this.ixToken)); this.load('listings', query('market', 'myListings', undefined, this.ixToken)); this.load('purchases', query('market', 'myPurchases', undefined, this.ixToken)); },
  methods: {
    applyVendor() { this.act('apply', mutate('market', 'applyAsVendor', { displayName: this.form.displayName, description: this.form.description }, this.ixToken)).then(() => { this.load('vendor', query('market', 'mine', undefined, this.ixToken)); }); },
    submitListing() {
      this.act('create', mutate('market', 'createListing', { title: this.listing.title, description: this.listing.description, offerType: 'one_time', assetId: this.listing.assetId, price: this.listing.price }, this.ixToken)).then((res) => {
        if (res && res.ok) {
          this.listing = { title: '', description: '', assetId: '', price: '' };
          this.load('listings', query('market', 'myListings', undefined, this.ixToken));
        }
      });
    }
  }
};
</script>
