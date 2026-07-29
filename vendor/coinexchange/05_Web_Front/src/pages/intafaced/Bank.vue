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
  </div>
</template>

<script>
/**
 * svc-bank (§8.1).
 *
 * Three real procedures, called for real. All three are gated on `bank:read`,
 * a scope svc-identity's `defaultScopes()` does not issue, so what a signed-in
 * reader sees today is a scope refusal quoted verbatim — not an empty table
 * dressed up as "no accounts yet".
 *
 * Nothing here computes a balance. `spaces.list` returns figures svc-bank read
 * from svc-ledger at request time (Doctrine §0.6), and this screen prints the
 * decimal strings it was given without touching them.
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
      schedules: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('spaces', query('bank', 'spaces.list', {}, this.ixToken));
    this.load('pools', query('bank', 'earn.pools', {}, this.ixToken));
    this.load('schedules', query('bank', 'transfers.listSchedules', undefined, this.ixToken));
  }
};
</script>
