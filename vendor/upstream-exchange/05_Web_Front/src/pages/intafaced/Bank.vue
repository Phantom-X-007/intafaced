<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.bank.title') }}</h1>
      <p>{{ $t('intafaced.modules.bank.blurb') }}</p>
      <div class="ix-source">svc-bank · /api/bank/trpc</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.modules.bank.title') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.modules.bank.note') }}</div>
    </div>

    <!-- spaces -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.spaces') }}</h2>
        <span class="ix-sub">spaces.list</span>
      </div>
      <IxState :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
        <div v-if="spaces.data && spaces.data.length" class="ix-kv">
          <div v-for="s in spaces.data" :key="s.id" class="ix-kv-item">
            <span class="k">{{ s.name }} · {{ s.assetId }}</span>
            <span class="v">{{ s.balance }}</span>
            <span v-if="s.goalTarget" style="font-size:12px;color:var(--ix-text-faint);">
              {{ $t('intafaced.bank.goal') }}: {{ s.goalTarget }}
            </span>
            <span v-if="s.lockedUntil" style="font-size:12px;color:var(--ix-text-faint);">
              {{ $t('intafaced.bank.lockedUntil') }}: {{ s.lockedUntil }}
            </span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <!-- earn pools -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.pools') }}</h2>
        <span class="ix-sub">earn.pools</span>
      </div>
      <IxState :loading="pools.loading" :reason="pools.reason" :message="pools.message" endpoint="/api/bank/trpc/earn.pools">
        <div v-if="pools.data && pools.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.pools') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.apr') }}</th>
                <th>{{ $t('intafaced.bank.term') }}</th>
                <th>{{ $t('intafaced.bank.minDeposit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in pools.data" :key="p.id">
                <td>{{ p.name }}</td>
                <td>{{ p.assetId }}</td>
                <td>{{ (p.aprBps / 100).toFixed(2) }}%</td>
                <td>{{ p.termDays === null ? '—' : p.termDays + ' ' + $t('intafaced.bank.days') }}</td>
                <td>{{ p.minDeposit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <!-- standing orders -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.schedules') }}</h2>
        <span class="ix-sub">transfers.listSchedules</span>
      </div>
      <IxState :loading="schedules.loading" :reason="schedules.reason" :message="schedules.message" endpoint="/api/bank/trpc/transfers.listSchedules">
        <div v-if="schedules.data && schedules.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.cadence') }}</th>
                <th>{{ $t('intafaced.bank.nextRun') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in schedules.data" :key="s.id">
                <td>{{ s.assetId }}</td>
                <td>{{ s.amount }}</td>
                <td>{{ s.cadence }}</td>
                <td>{{ s.nextRunAt }}</td>
                <td>{{ s.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <!-- loans (#202) — read only; open/draw is bank:write product, not this screen -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.loanProducts') }}</h2>
        <span class="ix-sub">loans.products</span>
      </div>
      <IxState :loading="loanProducts.loading" :reason="loanProducts.reason" :message="loanProducts.message" endpoint="/api/bank/trpc/loans.products">
        <div v-if="loanProducts.data && loanProducts.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.loanProducts') }}</th>
                <th>{{ $t('intafaced.bank.debt') }}</th>
                <th>{{ $t('intafaced.bank.collateral') }}</th>
                <th>{{ $t('intafaced.bank.apr') }}</th>
                <th>{{ $t('intafaced.bank.maxLtv') }}</th>
                <th>{{ $t('intafaced.bank.liqLtv') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in loanProducts.data" :key="p.id">
                <td>{{ p.name }}</td>
                <td>{{ p.debtAssetId }}</td>
                <td>{{ p.collateralAssetId }}</td>
                <td>{{ (p.aprBps / 100).toFixed(2) }}%</td>
                <td>{{ (p.maxLtvBps / 100).toFixed(0) }}%</td>
                <td>{{ (p.liquidationLtvBps / 100).toFixed(0) }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.myLoans') }}</h2>
        <span class="ix-sub">loans.list</span>
      </div>
      <IxState :loading="loans.loading" :reason="loans.reason" :message="loans.message" endpoint="/api/bank/trpc/loans.list">
        <div v-if="loans.data && loans.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.debt') }}</th>
                <th>{{ $t('intafaced.bank.principal') }}</th>
                <th>{{ $t('intafaced.bank.outstanding') }}</th>
                <th>{{ $t('intafaced.bank.collateral') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in loans.data" :key="l.id">
                <td>{{ l.debtAssetId }}</td>
                <td>{{ l.principal }}</td>
                <td>{{ l.outstandingPrincipal }}</td>
                <td>{{ l.collateral }} {{ l.collateralAssetId }}</td>
                <td>{{ l.status }}</td>
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
 * svc-bank (§8.1).
 *
 * Spaces / earn / schedules / loans read surfaces, called for real. All are
 * gated on `bank:read`, a scope svc-identity's `defaultScopes()` does not issue,
 * so what a signed-in reader sees today is a scope refusal quoted verbatim —
 * not an empty table dressed up as "no accounts yet".
 *
 * Nothing here computes a balance or LTV. Decimal strings from svc-bank (ledger
 * at request time, Doctrine §0.6) print as given. Open/draw/repay are bank:write
 * product flows and are deliberately not on this screen.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBank',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      spaces: this.emptySection(),
      pools: this.emptySection(),
      schedules: this.emptySection(),
      loanProducts: this.emptySection(),
      loans: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('spaces', query('bank', 'spaces.list', {}, this.ixToken));
    this.load('pools', query('bank', 'earn.pools', {}, this.ixToken));
    this.load('schedules', query('bank', 'transfers.listSchedules', undefined, this.ixToken));
    this.load('loanProducts', query('bank', 'loans.products', {}, this.ixToken));
    this.load('loans', query('bank', 'loans.list', undefined, this.ixToken));
  }
};
</script>
