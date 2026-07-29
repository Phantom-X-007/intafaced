<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.p2p.title') }}</h1>
      <p>{{ $t('intafaced.modules.p2p.blurb') }}</p>
      <div class="ix-source">svc-p2p · /api/p2p/trpc</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.p2p.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.offers') }}</h2>
        <span class="ix-sub">offers.list</span>
      </div>
      <IxState :loading="offers.loading" :reason="offers.reason" :message="offers.message" endpoint="/api/p2p/trpc/offers.list">
        <div v-if="offers.data && offers.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.side') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.p2p.price') }}</th>
                <th>{{ $t('intafaced.p2p.limits') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in offers.data" :key="o.id">
                <td :style="{ color: o.side === 'buy' ? 'var(--ix-up)' : 'var(--ix-down)' }">{{ o.side }}</td>
                <td>{{ o.asset }}</td>
                <td>{{ o.price }} {{ o.fiatCurrency }}</td>
                <td>{{ o.minAmount }} – {{ o.maxAmount }}</td>
                <td>{{ o.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.p2p.fiat') }}</h2>
        <span class="ix-sub">fiat.list</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.p2p.fiatLead') }}
      </p>
      <IxState :loading="fiat.loading" :reason="fiat.reason" :message="fiat.message" endpoint="/api/p2p/trpc/fiat.list">
        <div v-if="fiat.data && fiat.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.p2p.code') }}</th>
                <th>{{ $t('intafaced.p2p.name') }}</th>
                <th>{{ $t('intafaced.p2p.symbol') }}</th>
                <th>{{ $t('intafaced.p2p.minorUnits') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in fiat.data" :key="f.code">
                <td>{{ f.code }}</td>
                <td>{{ f.name }}</td>
                <td>{{ f.symbol }}</td>
                <td>{{ f.minorUnits }}</td>
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
 * svc-p2p (§6.2).
 *
 * `fiat.list` is a `publicProcedure` and returns the real enabled-currency
 * table — the one honest, unauthenticated read this module has today.
 *
 * `offers.list` is different in an instructive way. The scope it wants,
 * `p2p:read`, IS issued to an interactive session, so this is not the scope
 * gap that stops svc-bank. It is the jurisdiction matrix: the module demands
 * verification tier "basic" and a fresh account is tier "none". That refusal is
 * policy working, so it is shown as the service worded it rather than softened
 * into "no offers found".
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxP2P',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      offers: this.emptySection(),
      fiat: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('offers', query('p2p', 'offers.list', undefined, this.ixToken));
    this.load('fiat', query('p2p', 'fiat.list', undefined, this.ixToken));
  }
};
</script>
