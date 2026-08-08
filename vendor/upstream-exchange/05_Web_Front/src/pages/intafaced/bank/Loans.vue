<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.loansPage.title') }}</h1>
      <p>{{ $t('intafaced.bank.loansPage.lead') }}</p>
      <div class="ix-source">svc-bank · loans.products · loans.list · loans.health · loans.open · loans.addCollateral · loans.repay · loans.close</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── portfolio risk ─────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.health') }}</h2>
        <span class="ix-sub">loans.health</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.loansPage.healthLead') }}</p>
      <IxState :loading="health.loading" :reason="health.reason" :message="health.message" endpoint="/api/bank/trpc/loans.health">
        <div v-if="health.data">
          <div class="ix-kv">
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
          <div v-if="!health.data.loans.length" class="ix-note ix-note-quiet" style="margin-top:16px;">
            {{ $t('intafaced.bank.loansPage.noMarks') }}
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── my loans ───────────────────────────────────────────────────── -->
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
                <th>{{ $t('intafaced.bank.interest') }}</th>
                <th>{{ $t('intafaced.bank.collateral') }}</th>
                <th>{{ $t('intafaced.bank.apr') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.bank.marginCalled') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in loans.data" :key="l.id">
                <td>{{ l.debtAssetId }}</td>
                <td>{{ l.principal }}</td>
                <td>{{ l.outstandingPrincipal }}</td>
                <td>{{ l.outstandingInterest }}</td>
                <td>{{ l.collateral }} {{ l.collateralAssetId }}</td>
                <td>{{ bps(l.aprBps) }}</td>
                <td>{{ l.status }}</td>
                <td>{{ l.marginCalledAt === null ? '—' : l.marginCalledAt }}</td>
                <td>
                  <Button size="small" @click="manage(l)">{{ $t('intafaced.bank.manage') }}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noLoans') }}</div>
      </IxState>
    </div>

    <!-- ── manage one loan ────────────────────────────────────────────── -->
    <div v-if="managed" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.manageLoan') }}</h2>
        <span class="ix-sub">loans.addCollateral · loans.repay · loans.close</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.loansPage.manageLead') }}</p>

      <div class="ix-kv" style="margin-bottom:18px;">
        <div class="ix-kv-item">
          <span class="k">{{ $t('intafaced.bank.outstanding') }}</span>
          <span class="v">{{ managed.outstandingPrincipal }} {{ managed.debtAssetId }}</span>
        </div>
        <div class="ix-kv-item">
          <span class="k">{{ $t('intafaced.bank.interest') }}</span>
          <span class="v">{{ managed.outstandingInterest }} {{ managed.debtAssetId }}</span>
        </div>
        <div class="ix-kv-item">
          <span class="k">{{ $t('intafaced.bank.collateral') }}</span>
          <span class="v">{{ managed.collateral }} {{ managed.collateralAssetId }}</span>
        </div>
      </div>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-loan-collateral">{{ $t('intafaced.bank.addCollateralAmount') }}</label>
          <Input element-id="ix-loan-collateral" v-model="collateralAmount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-loan-repay">{{ $t('intafaced.bank.repayAmount') }}</label>
          <Input element-id="ix-loan-repay" v-model="repayAmount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
      </div>

      <div class="ix-actions">
        <Button :loading="collateralAdded.busy" :disabled="!collateralAmount" @click="submitCollateral">
          {{ $t('intafaced.bank.addCollateral') }}
        </Button>
        <Button type="primary" :loading="repaid.busy" :disabled="!repayAmount" @click="submitRepay">
          {{ $t('intafaced.bank.repay') }}
        </Button>
        <Button :loading="closed.busy" @click="submitClose">{{ $t('intafaced.bank.closeLoan') }}</Button>
      </div>

      <div v-if="collateralAdded.ran" style="margin-top:14px;">
        <div v-if="collateralAdded.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.collateralAdded') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.ledgerTx') }}: {{ collateralAdded.data.ledgerTxId }}</div>
        </div>
        <IxState v-else :loading="collateralAdded.busy" :reason="collateralAdded.reason" :message="collateralAdded.message" endpoint="/api/bank/trpc/loans.addCollateral"></IxState>
      </div>

      <div v-if="repaid.ran" style="margin-top:14px;">
        <div v-if="repaid.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.repaymentPosted') }}</strong>
          <div style="margin-top:6px;">
            {{ $t('intafaced.bank.interestPaid') }}: {{ repaid.data.interestPaid }} ·
            {{ $t('intafaced.bank.principalPaid') }}: {{ repaid.data.principalPaid }} ·
            {{ $t('intafaced.bank.remaining') }}: {{ repaid.data.remainingPrincipal }}
          </div>
        </div>
        <IxState v-else :loading="repaid.busy" :reason="repaid.reason" :message="repaid.message" endpoint="/api/bank/trpc/loans.repay"></IxState>
      </div>

      <div v-if="closed.ran" style="margin-top:14px;">
        <div v-if="closed.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.loanClosed') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.collateralReleased') }}: {{ closed.data.released }}</div>
        </div>
        <IxState v-else :loading="closed.busy" :reason="closed.reason" :message="closed.message" endpoint="/api/bank/trpc/loans.close"></IxState>
      </div>
    </div>

    <!-- ── products, and opening one ──────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.loanProducts') }}</h2>
        <span class="ix-sub">loans.products</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.loansPage.productsLead') }}</p>
      <IxState :loading="products.loading" :reason="products.reason" :message="products.message" endpoint="/api/bank/trpc/loans.products">
        <div v-if="products.data && products.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.productName') }}</th>
                <th>{{ $t('intafaced.bank.debt') }}</th>
                <th>{{ $t('intafaced.bank.collateral') }}</th>
                <th>{{ $t('intafaced.bank.apr') }}</th>
                <th>{{ $t('intafaced.bank.maxLtv') }}</th>
                <th>{{ $t('intafaced.bank.marginCallLtv') }}</th>
                <th>{{ $t('intafaced.bank.liqLtv') }}</th>
                <th>{{ $t('intafaced.bank.minPrincipal') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in products.data" :key="p.id">
                <td>{{ p.name }}</td>
                <td>{{ p.debtAssetId }}</td>
                <td>{{ p.collateralAssetId }}</td>
                <td>{{ bps(p.aprBps) }}</td>
                <td>{{ bps(p.maxLtvBps) }}</td>
                <td>{{ bps(p.marginCallLtvBps) }}</td>
                <td>{{ bps(p.liquidationLtvBps) }}</td>
                <td>{{ p.minPrincipal }}</td>
                <td>
                  <Button size="small" @click="chooseProduct(p)">{{ $t('intafaced.bank.borrow') }}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noProducts') }}</div>
      </IxState>
    </div>

    <div v-if="chosenProduct" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.openLoan') }}</h2>
        <span class="ix-sub">loans.open</span>
      </div>
      <div class="ix-note" style="margin-bottom:16px;">
        <strong>{{ $t('intafaced.bank.loansPage.liquidationTitle') }}</strong>
        <div style="margin-top:6px;">
          {{ $t('intafaced.bank.loansPage.liquidationBody', { margin: bps(chosenProduct.marginCallLtvBps), liq: bps(chosenProduct.liquidationLtvBps) }) }}
        </div>
      </div>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-loan-collat-in">{{ $t('intafaced.bank.collateralAmount') }} · {{ chosenProduct.collateralAssetId }}</label>
          <Input element-id="ix-loan-collat-in" v-model="openForm.collateralAmount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-loan-principal-in">{{ $t('intafaced.bank.principal') }} · {{ chosenProduct.debtAssetId }}</label>
          <Input element-id="ix-loan-principal-in" v-model="openForm.principal" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
      </div>
      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.bank.transfersPage.idempotency') }} <code>{{ draftId('loan') }}</code>
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="opened.busy" :disabled="!canOpen" @click="submitOpen">{{ $t('intafaced.bank.openLoan') }}</Button>
      </div>

      <div v-if="opened.ran" style="margin-top:14px;">
        <div v-if="opened.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.loanOpened') }}</strong>
          <div style="margin-top:6px;">
            {{ $t('intafaced.bank.status') }}: {{ opened.data.status }} ·
            {{ $t('intafaced.bank.openingLtv') }}: {{ bps(opened.data.ltvBps) }} ·
            {{ $t('intafaced.bank.ledgerTx') }}: {{ opened.data.drawLedgerTxId }}
          </div>
        </div>
        <IxState v-else :loading="opened.busy" :reason="opened.reason" :message="opened.message" endpoint="/api/bank/trpc/loans.open"></IxState>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * LOANS — svc-bank's `loans` router, every user-facing procedure.
 *
 * ── THE TWO THRESHOLDS ARE ON THE SCREEN BEFORE THE BUTTON ────────────────
 * `loans.products` publishes `marginCallLtvBps` and `liquidationLtvBps`, and
 * the router says why: "a leveraged product whose liquidation price is
 * discoverable only by being liquidated is not a product anyone can manage".
 * Both are rendered in the product table AND repeated above the open form, so
 * nobody reaches the button without having read them.
 *
 * ── WHAT THIS SCREEN DOES NOT DO ──────────────────────────────────────────
 * It does not compute an LTV, a health factor, a liquidation price, or the
 * maximum principal for a given collateral. All of those need a mark, and the
 * mark belongs to svc-bank (`loans.health`, and the `ltvBps` that comes back
 * from `open`). A number this screen worked out would be a second opinion on
 * somebody's liquidation level, arrived at without the price source the service
 * used. `bps` divides an integer rate field; it never touches an amount.
 *
 * `loanId` is client-supplied so a retried open is the same loan, not a second
 * leveraged position against collateral meant to be pledged once (§5).
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankLoans',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      managed: null,
      chosenProduct: null,
      collateralAmount: '',
      repayAmount: '',
      openForm: { collateralAmount: '', principal: '' },
      products: this.emptySection(),
      loans: this.emptySection(),
      health: this.emptySection(),
      opened: this.emptyAction(),
      collateralAdded: this.emptyAction(),
      repaid: this.emptyAction(),
      closed: this.emptyAction()
    };
  },
  computed: {
    canOpen() {
      return Boolean(this.chosenProduct && this.openForm.collateralAmount && this.openForm.principal && this.draftId('loan'));
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('products', query('bank', 'loans.products', {}, this.ixToken));
    this.reloadLoans();
  },
  methods: {
    bps(value) {
      return (value / 100).toFixed(2) + '%';
    },
    reloadLoans() {
      var self = this;
      this.load('loans', query('bank', 'loans.list', undefined, this.ixToken)).then(function(res) {
        // Keep the managed panel pointed at the SAME loan, refreshed. Dropping
        // it after a repayment would hide the outcome the reader just asked for.
        if (!self.managed || !res.ok || !res.data) return;
        var still = res.data.filter(function(l) { return l.id === self.managed.id; });
        self.managed = still.length ? still[0] : null;
      });
      this.load('health', query('bank', 'loans.health', undefined, this.ixToken));
    },
    manage(loan) {
      this.managed = loan;
      this.collateralAdded = this.emptyAction();
      this.repaid = this.emptyAction();
      this.closed = this.emptyAction();
    },
    chooseProduct(product) {
      this.chosenProduct = product;
      this.opened = this.emptyAction();
    },
    submitOpen() {
      var self = this;
      if (!this.canOpen) return;
      this.act(
        'opened',
        mutate(
          'bank',
          'loans.open',
          {
            loanId: this.draftId('loan'),
            productId: this.chosenProduct.id,
            collateralAmount: this.openForm.collateralAmount,
            principal: this.openForm.principal
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('loan');
        self.openForm = { collateralAmount: '', principal: '' };
        self.reloadLoans();
      });
    },
    submitCollateral() {
      var self = this;
      if (!this.managed || !this.collateralAmount) return;
      this.act(
        'collateralAdded',
        mutate('bank', 'loans.addCollateral', { loanId: this.managed.id, amount: this.collateralAmount }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.collateralAmount = '';
        self.reloadLoans();
      });
    },
    submitRepay() {
      var self = this;
      if (!this.managed || !this.repayAmount) return;
      this.act(
        'repaid',
        mutate('bank', 'loans.repay', { loanId: this.managed.id, amount: this.repayAmount }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.repayAmount = '';
        self.reloadLoans();
      });
    },
    submitClose() {
      var self = this;
      if (!this.managed) return;
      this.act('closed', mutate('bank', 'loans.close', { loanId: this.managed.id }, this.ixToken)).then(function(res) {
        if (res.ok) self.reloadLoans();
      });
    }
  }
};
</script>
