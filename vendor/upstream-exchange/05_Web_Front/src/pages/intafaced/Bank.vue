<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.bank.title') }}</h1>
      <p>{{ $t('intafaced.modules.bank.blurb') }}</p>
      <div class="ix-source">svc-bank · /api/bank/trpc</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.bank.overview.scopeTitle') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.bank.overview.scopeBody') }}</div>
    </div>

    <!-- ── spaces ──────────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.spaces') }}</h2>
        <span class="ix-sub">spaces.list</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.overview.spacesLead') }}</p>
      <IxState :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
        <div v-if="spaces.data && spaces.data.length" class="ix-kv">
          <div v-for="s in spaces.data" :key="s.id" class="ix-kv-item">
            <span class="k">{{ s.name }} · {{ s.assetId }}</span>
            <span class="v">{{ s.balance }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.overview.noSpaces') }}</div>
      </IxState>
      <div class="ix-actions" style="margin-top:16px;">
        <router-link to="/bank/spaces">
          <Button size="small">{{ $t('intafaced.bank.overview.openSpaces') }}</Button>
        </router-link>
      </div>
    </div>

    <!-- ── assets with no space ────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.unnamed') }}</h2>
        <span class="ix-sub">spaces.unnamed</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.overview.unnamedLead') }}</p>
      <IxState :loading="unnamed.loading" :reason="unnamed.reason" :message="unnamed.message" endpoint="/api/bank/trpc/spaces.unnamed">
        <div v-if="unnamed.data && unnamed.data.length" class="ix-kv">
          <div v-for="u in unnamed.data" :key="u.assetId" class="ix-kv-item">
            <span class="k">{{ u.assetId }}</span>
            <span class="v">{{ u.balance }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.overview.noUnnamed') }}</div>
      </IxState>
    </div>

    <!-- ── borrowing risk ──────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.health' ) }}</h2>
        <span class="ix-sub">loans.health</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.overview.healthLead') }}</p>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/bank/trpc/loans.health">
        <div v-if="health.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.bank.debtValue') }}</span>
            <span class="v">{{ health.data.debtValue }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.bank.collateralValue') }}</span>
            <span class="v">{{ health.data.collateralValue }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.bank.portfolioLtv') }}</span>
            <span class="v">{{ health.data.loans.length ? bps(health.data.portfolioLtvBps) : $t('intafaced.bank.noDebt') }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── standing orders + earn, as a next-thing-to-do strip ─────────── -->
    <div class="ix-grid">
      <router-link v-for="row in nav.slice(1)" :key="row.to" :to="row.to" class="ix-tile">
        <h3>{{ $t(row.labelKey) }}</h3>
        <p>{{ $t(row.labelKey + 'Blurb') }}</p>
        <div class="ix-source" style="margin:0;">{{ row.procedures }}</div>
      </router-link>
    </div>
  </div>
</template>

<script>
/**
 * svc-bank — the vertical's front page (§8.1).
 *
 * It used to be the WHOLE of /bank: five reads stacked flat, no inputs, no
 * buttons, and no way to reach anything svc-bank can actually do. The service
 * has eight routers; the screen had one screen. This page is now the summary
 * — what you hold, what has no home yet, and whether anything you have
 * borrowed is close to a margin call — and every other router has its own
 * screen under `config/ix-nav.js`.
 *
 * Nothing here computes a balance, an LTV or a total. Decimal strings from
 * svc-bank (read from the ledger at request time, Doctrine §0.6) print exactly
 * as they arrived. `bps` divides an INTEGER basis-point field, which is not
 * money and never touches an amount.
 */
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query } from '../../config/intafaced.js';
import { BANK_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBank',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      spaces: this.emptySection(),
      unnamed: this.emptySection(),
      health: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('spaces', query('bank', 'spaces.list', {}, this.ixToken));
    this.load('unnamed', query('bank', 'spaces.unnamed', undefined, this.ixToken));
    this.load('health', query('bank', 'loans.health', undefined, this.ixToken));
  },
  methods: {
    /** Basis points, an integer field, rendered as a percentage. Never an amount. */
    bps(value) {
      return (value / 100).toFixed(2) + '%';
    }
  }
};
</script>
