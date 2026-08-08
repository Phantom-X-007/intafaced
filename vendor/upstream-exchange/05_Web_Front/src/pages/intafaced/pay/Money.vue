<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.moneyPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.moneyPage.lead') }}</p>
      <div class="ix-source">svc-pay · withdrawal.balance · withdrawal.mine · withdrawal.create</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <!-- ── what the ledger says is available ────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.balanceTitle') }}</h2>
        <span class="ix-sub">withdrawal.balance</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.balanceLead') }}</p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-pay-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-pay-asset" v-model="assetId" :placeholder="$t('intafaced.bank.assetHint')" @on-enter="checkBalance"></Input>
        </div>
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

    <!-- ── send it out ──────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.newWithdrawal') }}</h2>
        <span class="ix-sub">withdrawal.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.moneyPage.withdrawLead') }}</p>

      <div class="ix-note ix-note-quiet" style="margin-bottom:16px;">
        <strong>{{ $t('intafaced.pay.moneyPage.stepUpTitle') }}</strong>
        <div style="margin-top:6px;">{{ $t('intafaced.pay.moneyPage.stepUpBody') }}</div>
      </div>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-wd-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-wd-asset" v-model="form.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-wd-amount">{{ $t('intafaced.pay.amount') }}</label>
          <Input element-id="ix-wd-amount" v-model="form.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label>{{ $t('intafaced.pay.rail') }}</label>
          <!-- The rail ids come from `health`, which is the service's own list.
               A free-text rail box would invite a name svc-pay has never heard
               of and turn a typo into a refusal nobody can read. -->
          <Select v-model="form.railId" :placeholder="$t('intafaced.pay.chooseRail')">
            <Option v-for="rail in railIds" :key="rail" :value="rail" :label="rail"></Option>
          </Select>
        </div>
        <div class="ix-field">
          <label for="ix-wd-kind">{{ $t('intafaced.pay.destinationKind') }}</label>
          <Input element-id="ix-wd-kind" v-model="form.destinationKind" :placeholder="$t('intafaced.pay.destinationKindHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-wd-ref">{{ $t('intafaced.pay.destinationRef') }}</label>
          <Input element-id="ix-wd-ref" v-model="form.destinationRef" :placeholder="$t('intafaced.pay.destinationRefHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-wd-client">{{ $t('intafaced.bank.clientRef') }}</label>
          <Input element-id="ix-wd-client" v-model="form.clientRef" :placeholder="$t('intafaced.bank.clientRefHint')"></Input>
        </div>
      </div>

      <div v-if="!railIds.length" class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.pay.moneyPage.noRailToUse') }}
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="sent.busy" :disabled="!canSend" @click="submitWithdrawal">
          {{ $t('intafaced.pay.withdrawNow') }}
        </Button>
      </div>

      <div v-if="sent.ran" style="margin-top:14px;">
        <div v-if="sent.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.pay.withdrawalAccepted') }}</strong>
          <div style="margin-top:6px;">
            {{ $t('intafaced.bank.status') }}: {{ sent.data.status }} ·
            {{ $t('intafaced.pay.railRef') }}: {{ sent.data.railRef === null ? '—' : sent.data.railRef }}
          </div>
        </div>
        <IxState v-else :loading="sent.busy" :reason="sent.reason" :message="sent.message" endpoint="/api/pay/trpc/withdrawal.create"></IxState>
      </div>
    </div>

    <!-- ── what has already left ────────────────────────────────────────── -->
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
                <th>{{ $t('intafaced.pay.created') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.pay.rail') }}</th>
                <th>{{ $t('intafaced.pay.destinationRef') }}</th>
                <th>{{ $t('intafaced.bank.clientRef') }}</th>
                <th>{{ $t('intafaced.pay.attempts') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.pay.failureCode') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in withdrawals.data" :key="w.id">
                <td>{{ w.createdAt }}</td>
                <td>{{ w.assetId }}</td>
                <td>{{ w.amount }}</td>
                <td>{{ w.rail }}</td>
                <td>{{ w.destination.kind }}/{{ w.destination.ref }}</td>
                <td>{{ w.clientRef }}</td>
                <td>{{ w.attempts }}</td>
                <td>{{ w.status }}</td>
                <td>{{ w.failureCode === null ? '—' : w.failureCode }}</td>
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
 * MY MONEY — svc-pay's `withdrawal` router: the user's own custodial balance
 * leaving the platform.
 *
 * ── THE BALANCE IS THE LEDGER'S ───────────────────────────────────────────
 * `withdrawal.balance` is `ledger:read` and svc-pay forwards svc-ledger's
 * answer rather than summing its own tables, because "the ledger is the
 * balance" (Doctrine §0.6). This screen forwards it again, as the decimal
 * string it is. Nothing here subtracts a pending withdrawal from it: the
 * available figure already reflects held value, and a browser-side subtraction
 * would be a second book.
 *
 * ── THE FORM IS DRAWN EVEN THOUGH IT USUALLY REFUSES ──────────────────────
 * `withdrawal.create` demands `trade:withdraw`, which is INTERACTIVE_ONLY and
 * which `requireScope` will not honour on a session that has not passed 2FA
 * step-up. An ordinary session therefore gets a named refusal, and the note
 * above the form says so BEFORE the reader fills it in. Hiding the form would
 * be the other kind of dishonesty: a withdrawal path that exists and that the
 * product pretends it does not have.
 *
 * `clientRef` is REQUIRED by the router — "there is no cancelling a payout" —
 * so it is a field on this form and not a hidden generated value. The reader's
 * own reference is what makes their retry the same withdrawal.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPayMoney',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      assetId: 'USDT',
      form: { assetId: 'USDT', amount: '', railId: '', destinationKind: '', destinationRef: '', clientRef: '' },
      health: this.emptySection(),
      balance: this.emptySection(),
      withdrawals: this.emptySection(),
      sent: this.emptyAction()
    };
  },
  computed: {
    railIds() {
      return (this.health.data && this.health.data.rails) || [];
    },
    canSend() {
      return Boolean(
        this.form.assetId &&
          this.form.amount &&
          this.form.railId &&
          this.form.destinationKind &&
          this.form.destinationRef &&
          this.form.clientRef
      );
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('health', query('pay', 'health', undefined, this.ixToken));
    this.checkBalance();
    this.reloadWithdrawals();
  },
  methods: {
    checkBalance() {
      if (!this.assetId) return;
      this.load('balance', query('pay', 'withdrawal.balance', { assetId: this.assetId }, this.ixToken));
    },
    reloadWithdrawals() {
      this.load('withdrawals', query('pay', 'withdrawal.mine', {}, this.ixToken));
    },
    submitWithdrawal() {
      var self = this;
      if (!this.canSend) return;
      this.act(
        'sent',
        mutate(
          'pay',
          'withdrawal.create',
          {
            assetId: this.form.assetId,
            amount: this.form.amount,
            railId: this.form.railId,
            destination: { kind: this.form.destinationKind, ref: this.form.destinationRef },
            clientRef: this.form.clientRef
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        // The amount clears; the destination and the rail do not. Somebody who
        // withdraws to the same address twice should not retype it, and the
        // `clientRef` stays visible so the next one is deliberately different.
        self.form.amount = '';
        self.checkBalance();
        self.reloadWithdrawals();
      });
    }
  }
};
</script>
