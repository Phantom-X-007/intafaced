<template>
  <div class="ix-card">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.quant.market.title') }}</h2>
      <span class="ix-sub">createStrategyListing</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.quant.market.lead') }}</p>
    <div class="ix-form">
      <label>{{ $t('intafaced.quant.market.listingTitle') }} <Input v-model="strategy.title" /></label>
      <label>{{ $t('intafaced.market.description') }} <Input v-model="strategy.description" type="textarea" /></label>
      <label>{{ $t('intafaced.market.assetId') }} <Input v-model="strategy.assetId" /></label>
      <label>{{ $t('intafaced.market.price') }} <Input v-model="strategy.price" :placeholder="$t('intafaced.quant.market.priceHint')" /></label>
      <label>{{ $t('intafaced.quant.market.period') }}
        <select v-model.number="strategy.periodSeconds">
          <option :value="null" disabled>{{ $t('intafaced.quant.market.periodUnset') }}</option>
          <option :value="86400">{{ $t('intafaced.quant.market.periodDay') }}</option>
          <option :value="604800">{{ $t('intafaced.quant.market.periodWeek') }}</option>
        </select>
      </label>
      <p class="ix-note ix-note-quiet">{{ $t('intafaced.quant.market.periodHint') }}</p>
      <Button type="primary" :loading="publish.busy" @click="submitStrategy">{{ $t('intafaced.quant.market.publish') }}</Button>
    </div>
    <IxState v-if="publish.ran" :loading="publish.busy" :reason="publish.reason" :message="publish.message" endpoint="/api/market/trpc/createStrategyListing">
      <div v-if="publish.data" class="ix-note ix-note-success">{{ $t('intafaced.quant.market.published') }}</div>
    </IxState>
    <p class="ix-note ix-note-quiet">{{ $t('intafaced.quant.market.noRank') }}</p>
  </div>
</template>
<script>
/**
 * Strategy publish card on /market/mine.
 * Writes through market.createStrategyListing → createListing(subscription, periodSeconds).
 * Stake gate is the existing vendor slot. Unstaked → market.stake_required on IxState.
 * No profit-share field. No returns board.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import { mutate } from '../../../config/intafaced.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
export default {
  name: 'IxStrategyListing',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      strategy: { title: '', description: '', assetId: '', price: '', periodSeconds: null },
      publish: this.emptyAction()
    };
  },
  methods: {
    submitStrategy() {
      var self = this;
      this.act('publish', mutate('market', 'createStrategyListing', {
        title: this.strategy.title,
        description: this.strategy.description,
        assetId: this.strategy.assetId,
        price: this.strategy.price,
        periodSeconds: this.strategy.periodSeconds
      }, this.ixToken)).then(function (res) {
        if (res && res.ok) {
          self.strategy = { title: '', description: '', assetId: '', price: '', periodSeconds: null };
          self.$emit('created');
        }
      });
    }
  }
};
</script>
