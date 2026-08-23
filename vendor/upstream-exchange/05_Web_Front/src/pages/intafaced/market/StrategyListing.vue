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

    <section class="ix-card ix-copy-directory">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.agents.copy.title') }}</h2>
        <span class="ix-sub">copyIntel.buildStats</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.agents.copy.lead') }}</p>
      <IxState :loading="copy.loading" :reason="copy.reason" :message="copy.message" endpoint="/api/agents/trpc/copyIntel.buildStats">
        <div v-if="copy.data && copy.data.status === 'empty'" class="ix-note ix-note-quiet">
          {{ $t('intafaced.agents.copy.empty') }}
        </div>
        <div v-else-if="copy.data && copy.data.status === 'unavailable'" class="ix-note">
          {{ $t('intafaced.agents.copy.unavailable') }}
        </div>
        <div v-else-if="copy.data && copy.data.status === 'ok' && copy.data.presentation && copy.data.presentation.rankedByReturns" class="ix-note">
          {{ $t('intafaced.agents.copy.unavailable') }}
        </div>
        <div v-else-if="copy.data && copy.data.status === 'ok' && copy.data.presentation && copy.data.presentation.kind === 'directory' && copy.data.presentation.sortKey === 'leaderId'">
          <div v-if="copyDirectory.length" class="ix-scroll">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.agents.copy.leaderId') }}</th>
                  <th>{{ $t('intafaced.agents.copy.realisedPnl') }}</th>
                  <th>{{ $t('intafaced.agents.copy.closedTrades') }}</th>
                  <th>{{ $t('intafaced.agents.copy.winRate') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in copyDirectory" :key="row.leaderId">
                  <td>{{ row.leaderId }}</td>
                  <td>{{ row.realisedPnl }}</td>
                  <td>{{ row.closedTrades }}</td>
                  <td>{{ row.winRate }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.agents.copy.empty') }}</div>
        </div>
        <div v-else class="ix-note">
          {{ $t('intafaced.agents.copy.unavailable') }}
        </div>
      </IxState>
    </section>

    <section class="ix-card ix-copy-confirm">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.quant.market.planMirror') }}</h2>
        <span class="ix-sub">copy.planMirror</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.quant.market.planMirrorLead') }}</p>
      <div class="ix-form">
        <label>{{ $t('intafaced.exchange.copy.followId') }} <Input v-model="mirror.followId" @on-change="mirrorDraftChanged" /></label>
        <label>{{ $t('intafaced.exchange.copy.fillId') }} <Input v-model="mirror.fillId" @on-change="mirrorDraftChanged" /></label>
        <label>{{ $t('intafaced.exchange.copy.markets') }} <Input v-model="mirror.marketId" @on-change="mirrorDraftChanged" /></label>
        <label>{{ $t('intafaced.exchange.copy.side') }}
          <select v-model="mirror.side" @change="mirrorDraftChanged">
            <option value="buy">{{ $t('exchange.terminal.buy') }}</option>
            <option value="sell">{{ $t('exchange.terminal.sell') }}</option>
          </select>
        </label>
        <label>{{ $t('intafaced.exchange.copy.qty') }} <Input v-model="mirror.qty" @on-change="mirrorDraftChanged" /></label>
        <label>{{ $t('intafaced.exchange.copy.notional') }} <Input v-model="mirror.notional" @on-change="mirrorDraftChanged" /></label>
        <label>{{ $t('intafaced.quant.market.leaderEnvironment') }}
          <select v-model="mirror.leaderPaper" @change="mirrorDraftChanged">
            <option :value="null" disabled>{{ $t('intafaced.quant.market.environmentUnset') }}</option>
            <option :value="false">{{ $t('intafaced.quant.market.environmentLive') }}</option>
            <option :value="true">{{ $t('intafaced.quant.market.environmentPaper') }}</option>
          </select>
        </label>
        <Button type="primary" :loading="mirrorPlanAction.busy" @click="planMirror">{{ $t('intafaced.quant.market.reviewMirror') }}</Button>
      </div>
      <IxState v-if="mirrorPlanAction.ran" :loading="mirrorPlanAction.busy" :reason="mirrorPlanAction.reason" :message="mirrorPlanAction.message" endpoint="/api/trade/trpc/copy.planMirror">
        <dl v-if="mirrorPlan" class="ix-meta">
          <div><dt>{{ $t('intafaced.exchange.copy.markets') }}</dt><dd>{{ mirrorPlan.marketId }}</dd></div>
          <div><dt>{{ $t('intafaced.exchange.copy.side') }}</dt><dd>{{ mirrorPlan.side }}</dd></div>
          <div><dt>{{ $t('intafaced.exchange.copy.qty') }}</dt><dd>{{ mirrorPlan.qty }}</dd></div>
          <div><dt>{{ $t('intafaced.exchange.copy.notional') }}</dt><dd>{{ mirrorPlan.notional }}</dd></div>
          <div><dt>{{ $t('intafaced.quant.market.nextExposure') }}</dt><dd>{{ mirrorPlan.nextExposure }}</dd></div>
        </dl>
      </IxState>
      <Button v-if="mirrorPlan" type="primary" :loading="mirrorConfirm.busy" @click="confirmMirror">{{ $t('intafaced.quant.market.confirmMirror') }}</Button>
      <IxState v-if="mirrorConfirm.ran" :loading="mirrorConfirm.busy" :reason="mirrorConfirm.reason" :message="mirrorConfirm.message" endpoint="/api/trade/trpc/copy.placeMirror">
        <div v-if="mirrorConfirm.data" class="ix-note ix-note-success">{{ $t('intafaced.quant.market.mirrorPlaced') }}</div>
      </IxState>
    </section>
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
import { query, mutate } from '../../../config/intafaced.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
import ixMoney from '../../../assets/js/ix-money.js';
export default {
  name: 'IxStrategyListing',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      strategy: { title: '', description: '', assetId: '', price: '', periodSeconds: null },
      publish: this.emptyAction(),
      copy: this.emptySection(),
      mirror: { followId: '', fillId: '', marketId: '', side: 'buy', qty: '', notional: '', leaderPaper: null },
      mirrorPlan: null,
      mirrorPlanAction: this.emptyAction(),
      mirrorConfirm: this.emptyAction()
    };
  },
  computed: {
    copyDirectory() {
      var data = this.copy.data;
      if (!data || data.status !== 'ok' || !Array.isArray(data.stats) || !data.presentation ||
        data.presentation.kind !== 'directory' || data.presentation.sortKey !== 'leaderId' ||
        data.presentation.rankedByReturns !== false) {
        return [];
      }
      return data.stats.slice();
    }
  },
  created() {
    this.load('copy', query('agents', 'copyIntel.buildStats', { fixtures: [], copyPlane: 'live' }, this.ixToken));
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
    },
    mirrorDraftChanged() {
      this.mirrorPlan = null;
      this.mirrorPlanAction = this.emptyAction();
      this.mirrorConfirm = this.emptyAction();
    },
    planMirror() {
      var followId = String(this.mirror.followId || '').trim();
      var fillId = String(this.mirror.fillId || '').trim();
      var marketId = String(this.mirror.marketId || '').trim();
      var qty = String(this.mirror.qty || '').trim();
      var notional = String(this.mirror.notional || '').trim();
      if (!followId || !fillId || !marketId || !ixMoney.isPositive(qty) || !ixMoney.isPositive(notional)) {
        this.mirrorPlanAction = { busy: false, ran: true, reason: 'trade.copy_envelope_invalid', message: this.$t('intafaced.exchange.copy.invalidPlace'), data: null };
        return;
      }
      var self = this;
      this.mirrorPlan = null;
      this.mirrorConfirm = this.emptyAction();
      this.act('mirrorPlanAction', mutate('trade', 'copy.planMirror', {
        followId: followId,
        fillId: fillId,
        marketId: marketId,
        side: this.mirror.side,
        qty: qty,
        notional: notional
      }, this.ixToken)).then(function (res) {
        if (res && res.ok) self.mirrorPlan = res.data;
      });
    },
    confirmMirror() {
      if (!this.mirrorPlan || typeof this.mirror.leaderPaper !== 'boolean') {
        this.mirrorConfirm = { busy: false, ran: true, reason: 'trade.copy_environment_unset', message: this.$t('intafaced.quant.market.environmentUnset'), data: null };
        return;
      }
      var self = this;
      this.act('mirrorConfirm', mutate('trade', 'copy.placeMirror', {
        followId: this.mirrorPlan.followId,
        fillId: this.mirrorPlan.fillId,
        leaderPaper: this.mirror.leaderPaper
      }, this.ixToken)).then(function (res) {
        if (res && res.ok) self.mirrorPlan = null;
      });
    }
  }
};
</script>
