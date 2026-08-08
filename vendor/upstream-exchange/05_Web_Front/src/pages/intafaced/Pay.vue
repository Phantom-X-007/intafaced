<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.pay.title') }}</h1>
      <p>{{ $t('intafaced.modules.pay.blurb') }}</p>
      <div class="ix-source">svc-pay · /api/pay/trpc</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.pay.note') }}
    </div>

    <!-- ── is the service there, and what rails does it know about ───────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.healthTitle') }}</h2>
        <span class="ix-sub">health</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.healthLead') }}</p>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/pay/trpc/health">
        <div v-if="health.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">service</span>
            <span class="v">{{ health.data.service }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.rails') }}</span>
            <span class="v">{{ (health.data.rails && health.data.rails.length) ? health.data.rails.join(', ') : $t('intafaced.pay.noRails') }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── the rails, in the detail an operator needs ────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.railHealthTitle') }}</h2>
        <span class="ix-sub">railHealth</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.railHealthLead') }}</p>
      <IxState :loading="railHealth.loading" :reason="railHealth.reason" :message="railHealth.message" endpoint="/api/pay/trpc/railHealth">
        <div v-if="railHealth.data && railHealth.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.railId') }}</th>
                <th>{{ $t('intafaced.pay.mode') }}</th>
                <th>{{ $t('intafaced.pay.capabilities') }}</th>
                <th>{{ $t('intafaced.pay.usable') }}</th>
                <th>{{ $t('intafaced.pay.healthy') }}</th>
                <th>{{ $t('intafaced.pay.latency') }}</th>
                <th>{{ $t('intafaced.pay.railReason') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in railHealth.data" :key="r.id">
                <td>{{ r.id }}</td>
                <td>{{ r.mode }}</td>
                <td>{{ r.capabilities.join(', ') }}</td>
                <td>{{ r.usable ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ r.healthy ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ r.latencyMs }} ms</td>
                <td>{{ r.reason ? r.reason : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noRails') }}</div>
      </IxState>
    </div>

    <!-- ── whether this account is a merchant at all ─────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.merchantTitle') }}</h2>
        <span class="ix-sub">merchant.me</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.overview.merchantLead') }}</p>
      <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
        <div v-if="merchant.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.merchantMode') }}</span>
            <span class="v">{{ merchant.data.mode }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.bank.status') }}</span>
            <span class="v">{{ merchant.data.status }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.kybStatus') }}</span>
            <span class="v">{{ merchant.data.kybStatus }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.overview.notAMerchant') }}</div>
      </IxState>
      <div class="ix-actions" style="margin-top:16px;">
        <router-link to="/pay/merchant">
          <Button size="small">{{ $t('intafaced.pay.overview.openMerchant') }}</Button>
        </router-link>
      </div>
    </div>

    <!-- ── the rest of the vertical ─────────────────────────────────────── -->
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
 * svc-pay — the vertical's front page (§6.1).
 *
 * It used to be the WHOLE of /pay: health, one balance box and a withdrawal
 * list, on a service that runs a merchant acquirer, hosted checkout, a payment
 * lifecycle, settlement and payouts. Those are now screens under
 * `config/ix-nav.js`, and this page answers only the questions that belong at
 * the top of a vertical: is the service there, which rails does it have, and is
 * this account a merchant.
 *
 * `railHealth` IS drawn even though it demands `pay:read`, which an ordinary
 * interactive session is not issued. That is deliberate: `IxState` renders a
 * SCOPE_DENIED as the named refusal it is, which is a true statement about the
 * platform. Leaving it off the page — the previous screen's choice — hid the
 * gap instead of reporting it, and a reader could not tell the surface from a
 * surface that does not exist.
 *
 * `merchant.me` answers `null` for an account that has never onboarded. That is
 * a 200 with no merchant, not a refusal, so it renders as the empty state and
 * points at the screen that creates one.
 */
import IxState from '../../components/intafaced/IxState.vue';
import IxSubNav from '../../components/intafaced/IxSubNav.vue';
import { query } from '../../config/intafaced.js';
import { PAY_NAV } from '../../config/ix-nav.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPay',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      health: this.emptySection(),
      railHealth: this.emptySection(),
      merchant: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.load('railHealth', query('pay', 'railHealth', undefined, this.ixToken));
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken));
  }
};
</script>
