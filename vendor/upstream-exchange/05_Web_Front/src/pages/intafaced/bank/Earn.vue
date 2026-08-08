<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.pools') }}</h1>
      <p>{{ $t('intafaced.bank.earnPage.lead') }}</p>
      <div class="ix-source">svc-bank · earn.pools · earn.positions · earn.deposit · earn.withdraw</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── the pools on offer ──────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.pools') }}</h2>
        <span class="ix-sub">earn.pools</span>
      </div>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-pool-filter">{{ $t('intafaced.bank.filterAsset') }}</label>
          <Input element-id="ix-pool-filter" v-model="filterAsset" :placeholder="$t('intafaced.bank.filterAssetHint')" @on-enter="reloadPools"></Input>
        </div>
        <div class="ix-form-action">
          <Button size="small" @click="reloadPools">{{ $t('intafaced.state.refresh') }}</Button>
        </div>
      </div>

      <IxState :loading="pools.loading" :reason="pools.reason" :message="pools.message" endpoint="/api/bank/trpc/earn.pools">
        <div v-if="pools.data && pools.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.poolName') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.kind') }}</th>
                <th>{{ $t('intafaced.bank.apr') }}</th>
                <th>{{ $t('intafaced.bank.term') }}</th>
                <th>{{ $t('intafaced.bank.minDeposit') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in pools.data" :key="p.id">
                <td>{{ p.name }}</td>
                <td>{{ p.assetId }}</td>
                <td>{{ p.kind }}</td>
                <td>{{ bps(p.aprBps) }}</td>
                <td>{{ p.termDays === null ? $t('intafaced.bank.flexibleTerm') : p.termDays + ' ' + $t('intafaced.bank.days') }}</td>
                <td>{{ p.minDeposit }}</td>
                <td>
                  <Button size="small" @click="choosePool(p)">{{ $t('intafaced.bank.deposit') }}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noPools') }}</div>
      </IxState>
    </div>

    <!-- ── deposit into the chosen pool ────────────────────────────────── -->
    <div v-if="chosen" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.deposit') }}</h2>
        <span class="ix-sub">earn.deposit</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.earnPage.depositLead') }}</p>
      <div class="ix-kv" style="margin-bottom:16px;">
        <div class="ix-kv-item">
          <span class="k">{{ $t('intafaced.bank.poolName') }}</span>
          <span class="v" style="font-size:15px;">{{ chosen.name }}</span>
        </div>
        <div class="ix-kv-item">
          <span class="k">{{ $t('intafaced.bank.minDeposit') }}</span>
          <span class="v">{{ chosen.minDeposit }}</span>
        </div>
        <div class="ix-kv-item">
          <span class="k">{{ $t('intafaced.bank.apr') }}</span>
          <span class="v">{{ bps(chosen.aprBps) }}</span>
        </div>
      </div>
      <div class="ix-form-row">
        <div class="ix-field">
          <label for="ix-earn-amount">{{ $t('intafaced.pay.amount') }}</label>
          <Input element-id="ix-earn-amount" v-model="depositAmount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :loading="deposited.busy" :disabled="!depositAmount" @click="submitDeposit">
            {{ $t('intafaced.bank.deposit') }}
          </Button>
        </div>
      </div>

      <div v-if="deposited.ran" style="margin-top:14px;">
        <div v-if="deposited.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.depositAccepted') }}</strong>
          <div style="margin-top:6px;">
            {{ $t('intafaced.bank.maturesAt') }}:
            {{ deposited.data.maturesAt === null ? $t('intafaced.bank.flexibleTerm') : deposited.data.maturesAt }}
          </div>
        </div>
        <IxState v-else :loading="deposited.busy" :reason="deposited.reason" :message="deposited.message" endpoint="/api/bank/trpc/earn.deposit"></IxState>
      </div>
    </div>

    <!-- ── my positions ───────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.positions') }}</h2>
        <span class="ix-sub">earn.positions</span>
      </div>
      <IxState :loading="positions.loading" :reason="positions.reason" :message="positions.message" endpoint="/api/bank/trpc/earn.positions">
        <div v-if="positions.data && positions.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.principal') }}</th>
                <th>{{ $t('intafaced.bank.maturesAt') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in positions.data" :key="p.id">
                <td>{{ p.assetId }}</td>
                <td>{{ p.principal }}</td>
                <td>{{ p.maturesAt === null ? $t('intafaced.bank.flexibleTerm') : p.maturesAt }}</td>
                <td>
                  <Button size="small" :loading="withdrawn.busy && withdrawingId === p.id" @click="submitWithdraw(p)">
                    {{ $t('intafaced.bank.withdraw') }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noPositions') }}</div>
      </IxState>

      <div v-if="withdrawn.ran" style="margin-top:14px;">
        <div v-if="withdrawn.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.positionClosed') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.principal') }}: {{ withdrawn.data.principal }}</div>
        </div>
        <IxState v-else :loading="withdrawn.busy" :reason="withdrawn.reason" :message="withdrawn.message" endpoint="/api/bank/trpc/earn.withdraw"></IxState>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * EARN — svc-bank's `earn` router, all four procedures.
 *
 * The APR is an INTEGER basis-point field, so `bps` divides it by 100 to print
 * a percentage. That is arithmetic on a rate, not on money: every amount on
 * this screen (`minDeposit`, `principal`) is the decimal string svc-bank sent
 * and is rendered untouched. Nothing here projects an interest figure either —
 * accrual is `ops.accrueInterest` behind `admin:treasury`, and a yield this
 * screen calculated would be a second answer to a question the ledger already
 * answers.
 *
 * `earn.deposit` accepts an optional client `positionId`; it is not sent,
 * because a deposit that lands twice adds principal rather than moving value
 * out, and pinning the id would silently merge two deliberate deposits of the
 * same size into one. The service's own `positionId` is what comes back.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankEarn',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      filterAsset: '',
      chosen: null,
      depositAmount: '',
      withdrawingId: '',
      pools: this.emptySection(),
      positions: this.emptySection(),
      deposited: this.emptyAction(),
      withdrawn: this.emptyAction()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.reloadPools();
    this.reloadPositions();
  },
  methods: {
    bps(value) {
      return (value / 100).toFixed(2) + '%';
    },
    reloadPools() {
      var input = this.filterAsset ? { assetId: this.filterAsset } : {};
      this.load('pools', query('bank', 'earn.pools', input, this.ixToken));
    },
    reloadPositions() {
      this.load('positions', query('bank', 'earn.positions', undefined, this.ixToken));
    },
    choosePool(pool) {
      this.chosen = pool;
      this.deposited = this.emptyAction();
    },
    submitDeposit() {
      var self = this;
      if (!this.chosen || !this.depositAmount) return;
      this.act(
        'deposited',
        mutate('bank', 'earn.deposit', { poolId: this.chosen.id, amount: this.depositAmount }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.depositAmount = '';
        self.reloadPositions();
      });
    },
    submitWithdraw(position) {
      var self = this;
      this.withdrawingId = position.id;
      this.act('withdrawn', mutate('bank', 'earn.withdraw', { positionId: position.id }, this.ixToken)).then(function(res) {
        self.withdrawingId = '';
        if (res.ok) self.reloadPositions();
      });
    }
  }
};
</script>
