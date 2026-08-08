<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.analyticsPage.title') }}</h1>
      <p>{{ $t('intafaced.bank.analyticsPage.lead') }}</p>
      <div class="ix-source">svc-bank · analytics.spend</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.analyticsPage.rangeTitle') }}</h2>
        <span class="ix-sub">analytics.spend</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.analyticsPage.rangeLead') }}</p>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-an-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-an-asset" v-model="form.assetId" :placeholder="$t('intafaced.bank.assetHint')" @on-enter="run"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-an-from">{{ $t('intafaced.bank.from') }}</label>
          <Input element-id="ix-an-from" v-model="form.from" :placeholder="$t('intafaced.bank.isoHint')" @on-enter="run"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-an-to">{{ $t('intafaced.bank.to') }}</label>
          <Input element-id="ix-an-to" v-model="form.to" :placeholder="$t('intafaced.bank.isoHint')" @on-enter="run"></Input>
        </div>
      </div>

      <div class="ix-actions">
        <Button type="primary" :disabled="!canRun" @click="run">{{ $t('intafaced.bank.analyticsPage.summarise') }}</Button>
        <Button size="small" @click="lastDays(30)">{{ $t('intafaced.bank.last30') }}</Button>
        <Button size="small" @click="lastDays(90)">{{ $t('intafaced.bank.last90') }}</Button>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.analyticsPage.summaryTitle') }}</h2>
        <span class="ix-sub">{{ form.assetId }}</span>
      </div>
      <IxState :loading="summary.loading" :reason="summary.reason" :message="summary.message" endpoint="/api/bank/trpc/analytics.spend">
        <div v-if="summary.data">
          <div class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.totalOutflow') }}</span>
              <span class="v">{{ summary.data.totalOutflow }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.totalInflow') }}</span>
              <span class="v">{{ summary.data.totalInflow }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.net') }}</span>
              <span class="v">{{ summary.data.net }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.movements') }}</span>
              <span class="v">{{ summary.data.movements }}</span>
            </div>
          </div>

          <!-- The categories svc-bank grouped by. The screen does not invent a
               category, re-label one, or add an "other" bucket the service did
               not send. An empty record is an answer: no outflow in the window. -->
          <div style="margin-top:20px;">
            <h3 class="ix-subhead">{{ $t('intafaced.bank.byCategory') }}</h3>
            <div v-if="categories.length" class="ix-scroll">
              <table class="ix-table">
                <thead>
                  <tr>
                    <th>{{ $t('intafaced.bank.category') }}</th>
                    <th>{{ $t('intafaced.bank.outflow') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in categories" :key="row.name">
                    <td>{{ row.name }}</td>
                    <td>{{ row.amount }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noOutflow') }}</div>
          </div>

          <div class="ix-source" style="margin-top:18px;">
            {{ summary.data.from }} → {{ summary.data.to }}
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * SPEND ANALYTICS — svc-bank's `analytics.spend`, the whole router.
 *
 * ── EVERY FIGURE ON THIS SCREEN CAME OFF THE WIRE ─────────────────────────
 * `totalOutflow`, `totalInflow`, `net` and each category are decimal strings
 * svc-bank computed from the ledger, and they are printed exactly as they
 * arrived. This page adds nothing up. A total the browser summed would be a
 * second answer to a question the ledger has already answered, and the two
 * would disagree the first time a category was added — the reader would then
 * have two numbers and no way to tell which was the book's.
 *
 * There is no chart. A bar chart of category outflow needs a scale, a scale
 * needs a maximum, and a maximum needs the amounts as numbers — which is
 * exactly the parse this platform forbids on a money path. The table is the
 * honest rendering of decimal strings.
 *
 * ── THE RANGE IS THE READER'S, AND IT IS PRE-FILLED ───────────────────────
 * The procedure requires `from` and `to`; a blank pair would refuse before the
 * reader had done anything wrong. `lastDays` seeds ISO-8601 instants (dates,
 * never money) so the first render is a real answer rather than a form.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankAnalytics',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      form: { assetId: 'USDT', from: '', to: '' },
      summary: this.emptySection()
    };
  },
  computed: {
    canRun() {
      return Boolean(this.form.assetId && this.form.from && this.form.to);
    },
    /**
     * `outflowByCategory` is a record, and a record has no order. Sorting by
     * name keeps two consecutive loads of the same window in the same order —
     * a table that reshuffles between refreshes reads as changed data.
     */
    categories() {
      var byCategory = (this.summary.data && this.summary.data.outflowByCategory) || {};
      var rows = [];
      for (var name in byCategory) {
        if (!Object.prototype.hasOwnProperty.call(byCategory, name)) continue;
        rows.push({ name: name, amount: byCategory[name] });
      }
      rows.sort(function(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      return rows;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.lastDays(30);
  },
  methods: {
    /** Seed the window. Instants, not amounts — `Date` never touches money here. */
    lastDays(days) {
      var to = new Date();
      var from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      this.form.from = from.toISOString();
      this.form.to = to.toISOString();
      this.run();
    },
    run() {
      if (!this.canRun) return;
      this.load(
        'summary',
        query('bank', 'analytics.spend', { assetId: this.form.assetId, from: this.form.from, to: this.form.to }, this.ixToken)
      );
    }
  }
};
</script>
