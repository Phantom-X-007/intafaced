<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.pay.title') }}</h1>
      <p>{{ $t('intafaced.modules.pay.blurb') }}</p>
      <div class="ix-source">svc-pay · /api/pay/trpc</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.pay.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.healthTitle') }}</h2>
        <span class="ix-sub">health</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.pay.healthLead') }}
      </p>
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

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.balanceTitle') }}</h2>
        <span class="ix-sub">withdrawal.balance</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.pay.balanceLead') }}
      </p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <Input v-model="assetId" :placeholder="$t('intafaced.pay.asset')" @on-enter="checkBalance"></Input>
        <div class="ix-form-action">
          <Button type="primary" @click="checkBalance">{{ $t('intafaced.pay.check') }}</Button>
        </div>
      </div>
      <IxState :loading="balance.loading" :reason="balance.reason" :message="balance.message" endpoint="/api/pay/trpc/withdrawal.balance">
        <div class="ix-kv" v-if="balance.data">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.pay.available') }} · {{ assetId }}</span>
            <span class="v">{{ balance.data.available }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.withdrawals') }}</h2>
        <span class="ix-sub">withdrawal.mine</span>
      </div>
      <IxState :loading="withdrawals.loading" :reason="withdrawals.reason" :message="withdrawals.message" endpoint="/api/pay/trpc/withdrawal.mine">
        <div v-if="withdrawals.data && withdrawals.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.pay.created') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in withdrawals.data" :key="w.id">
                <td>{{ w.assetId }}</td>
                <td>{{ w.amount }}</td>
                <td>{{ w.status }}</td>
                <td>{{ w.createdAt }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noWithdrawals') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-pay — health + the two surfaces a normal session can actually reach.
 *
 * `health` is public and lists configured rail ids (may be empty / sandbox-only).
 * Hosted checkout (#214) is a separate public HTML path at /api/pay/checkout —
 * not a merchant dashboard on this page. `railHealth` needs pay:read (issued to
 * nobody) so it is not drawn as a false permanent 403.
 *
 * `withdrawal.balance` is gated on `ledger:read` and `withdrawal.mine` on
 * `trade:read`, both of which an interactive session holds.
 *
 * The balance is svc-ledger's number, forwarded. svc-pay does not sum its own
 * tables for it and neither does this screen.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPay',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      assetId: 'USDT',
      health: this.emptySection(),
      balance: this.emptySection(),
      withdrawals: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.checkBalance();
    this.load('withdrawals', query('pay', 'withdrawal.mine', undefined, this.ixToken));
  },
  methods: {
    checkBalance() {
      if (!this.assetId) return;
      this.load('balance', query('pay', 'withdrawal.balance', { assetId: this.assetId }, this.ixToken));
    }
  }
};
</script>
