<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.rampsPage.title') }}</h1>
      <p>{{ $t('intafaced.bank.rampsPage.lead') }}</p>
      <div class="ix-source">svc-bank · ramps.programme · ramps.onramps · ramps.offramps · ramps.offramp</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── what programme this deployment has, INCLUDING that it simulates ─ -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.programme') }}</h2>
        <span class="ix-sub">ramps.programme</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.rampsPage.programmeLead') }}</p>
      <IxState :loading="programme.loading" :reason="programme.reason" :message="programme.message" endpoint="/api/bank/trpc/ramps.programme">
        <div v-if="programme.data">
          <div class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.programmeName') }}</span>
              <span class="v" style="font-size:15px;">{{ programme.data.displayName }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.cryptoRail') }}</span>
              <span class="v" style="font-size:15px;">
                {{ programme.data.cryptoRail === null ? $t('intafaced.bank.noRail') : programme.data.cryptoRail }}
              </span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.simulated') }}</span>
              <span class="v" style="font-size:15px;">
                {{ programme.data.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}
              </span>
            </div>
          </div>

          <div v-if="programme.data.simulated" class="ix-note" style="margin-top:16px;">
            <strong>{{ $t('intafaced.bank.rampsPage.simulatedTitle') }}</strong>
            <div style="margin-top:6px;">{{ $t('intafaced.bank.rampsPage.simulatedBody') }}</div>
          </div>

          <!-- The fiat leg is a §13 socket and the router literally types it as
               one. Rendering it as an unavailable option is the honest answer;
               drawing a fiat form that always refuses would be worse. -->
          <div class="ix-note" style="margin-top:16px;">
            <strong>{{ $t('intafaced.bank.rampsPage.fiatTitle') }}</strong>
            <div style="margin-top:6px;">{{ $t('intafaced.bank.rampsPage.fiatBody') }}</div>
            <div style="margin-top:8px;"><code>{{ programme.data.fiatLeg }}</code></div>
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── value that arrived ─────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.onramps') }}</h2>
        <span class="ix-sub">ramps.onramps</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.rampsPage.onrampsLead') }}</p>
      <IxState :loading="onramps.loading" :reason="onramps.reason" :message="onramps.message" endpoint="/api/bank/trpc/ramps.onramps">
        <div v-if="onramps.data && onramps.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.created') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.kind') }}</th>
                <th>{{ $t('intafaced.bank.rail') }}</th>
                <th>{{ $t('intafaced.bank.railRef') }}</th>
                <th>{{ $t('intafaced.bank.simulated') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.bank.ledgerTx') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in onramps.data" :key="r.id">
                <td>{{ r.createdAt }}</td>
                <td>{{ r.assetId }}</td>
                <td>{{ r.amount }}</td>
                <td>{{ r.kind }}</td>
                <td>{{ r.rail }}</td>
                <td>{{ r.railRef }}</td>
                <td>{{ r.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ r.status }}</td>
                <td>{{ r.ledgerTxId === null ? '—' : r.ledgerTxId }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noOnramps') }}</div>
      </IxState>
    </div>

    <!-- ── send value out ─────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.newOfframp') }}</h2>
        <span class="ix-sub">ramps.offramp</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.rampsPage.offrampLead') }}</p>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-ramp-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-ramp-asset" v-model="form.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-ramp-amount">{{ $t('intafaced.pay.amount') }}</label>
          <Input element-id="ix-ramp-amount" v-model="form.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-ramp-dest">{{ $t('intafaced.bank.destinationRef') }}</label>
          <Input element-id="ix-ramp-dest" v-model="form.destinationRef" :placeholder="$t('intafaced.bank.destinationRefHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-ramp-client">{{ $t('intafaced.bank.clientRef') }}</label>
          <Input element-id="ix-ramp-client" v-model="form.clientRef" :placeholder="$t('intafaced.bank.clientRefHint')"></Input>
        </div>
      </div>

      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.bank.transfersPage.idempotency') }} <code>{{ draftId('offramp') }}</code>
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="sent.busy" :disabled="!canSend" @click="submitOfframp">
          {{ $t('intafaced.bank.sendOut') }}
        </Button>
      </div>

      <div v-if="sent.ran" style="margin-top:14px;">
        <div v-if="sent.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.offrampAccepted') }}</strong>
          <div style="margin-top:6px;">
            {{ $t('intafaced.bank.status') }}: {{ sent.data.status }} ·
            {{ $t('intafaced.bank.holdTx') }}: {{ sent.data.holdLedgerTxId === null ? '—' : sent.data.holdLedgerTxId }}
          </div>
        </div>
        <IxState v-else :loading="sent.busy" :reason="sent.reason" :message="sent.message" endpoint="/api/bank/trpc/ramps.offramp"></IxState>
      </div>
    </div>

    <!-- ── value that left ────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.offramps') }}</h2>
        <span class="ix-sub">ramps.offramps</span>
      </div>
      <IxState :loading="offramps.loading" :reason="offramps.reason" :message="offramps.message" endpoint="/api/bank/trpc/ramps.offramps">
        <div v-if="offramps.data && offramps.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.created') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.kind') }}</th>
                <th>{{ $t('intafaced.bank.rail') }}</th>
                <th>{{ $t('intafaced.bank.destinationRef') }}</th>
                <th>{{ $t('intafaced.bank.simulated') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.bank.holdTx') }}</th>
                <th>{{ $t('intafaced.bank.settlementTx') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in offramps.data" :key="r.id">
                <td>{{ r.createdAt }}</td>
                <td>{{ r.assetId }}</td>
                <td>{{ r.amount }}</td>
                <td>{{ r.kind }}</td>
                <td>{{ r.rail }}</td>
                <td>{{ r.destinationRef }}</td>
                <td>{{ r.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ r.status }}</td>
                <td>{{ r.holdLedgerTxId === null ? '—' : r.holdLedgerTxId }}</td>
                <td>{{ r.settleLedgerTxId === null ? '—' : r.settleLedgerTxId }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noOfframps') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * RAMPS — svc-bank's `ramps` router, every user-facing procedure.
 *
 * ── THE FIAT LEG IS A SOCKET AND THE SCREEN SAYS SO ───────────────────────
 * The router types `fiatLeg` as the literal `'socket.psp-partners'` — a §13
 * socket, not a feature — and `offramp` refuses `kind: 'fiat'` before any hold
 * is posted. So this screen offers the CRYPTO direction only and states the
 * fiat absence beside the programme. A currency selector that always refused
 * would advertise a rail that does not exist and cost a reader the round trip
 * to find that out.
 *
 * ── `simulated` IS A COLUMN, NOT A FOOTNOTE ───────────────────────────────
 * The router never omits it: this surface does not broadcast to a chain. Every
 * row carries it, and a simulated programme gets a standing note, for the same
 * reason `Cards.vue` does it — a simulated movement drawn like a real one is
 * the worst thing either page could do.
 *
 * `offrampId` and `clientRef` are both client-supplied so a retried send is the
 * SAME withdrawal (§5). `offrampId` is minted once per draft by `draftId` and
 * released only after svc-bank accepts it; `clientRef` is the reader's own
 * reference and is theirs to reuse.
 *
 * Amounts are decimal strings the service sent. Nothing here parses one.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankRamps',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      form: { assetId: '', amount: '', destinationRef: '', clientRef: '' },
      programme: this.emptySection(),
      onramps: this.emptySection(),
      offramps: this.emptySection(),
      sent: this.emptyAction()
    };
  },
  computed: {
    canSend() {
      return Boolean(
        this.form.assetId && this.form.amount && this.form.destinationRef && this.form.clientRef && this.draftId('offramp')
      );
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('programme', query('bank', 'ramps.programme', undefined, this.ixToken));
    this.reloadMovements();
  },
  methods: {
    reloadMovements() {
      this.load('onramps', query('bank', 'ramps.onramps', undefined, this.ixToken));
      this.load('offramps', query('bank', 'ramps.offramps', undefined, this.ixToken));
    },
    submitOfframp() {
      var self = this;
      if (!this.canSend) return;
      this.act(
        'sent',
        mutate(
          'bank',
          'ramps.offramp',
          {
            offrampId: this.draftId('offramp'),
            assetId: this.form.assetId,
            amount: this.form.amount,
            // Crypto only, and stated rather than selected — see the header.
            kind: 'crypto',
            destinationRef: this.form.destinationRef,
            clientRef: this.form.clientRef
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('offramp');
        self.form = { assetId: '', amount: '', destinationRef: '', clientRef: '' };
        self.reloadMovements();
      });
    }
  }
};
</script>
