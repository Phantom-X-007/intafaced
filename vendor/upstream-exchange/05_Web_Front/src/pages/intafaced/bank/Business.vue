<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.business.title') }}</h1>
      <p>{{ $t('intafaced.bank.business.lead') }}</p>
      <div class="ix-source">svc-bank · business.list · business.create · business.proposeTransfer · business.pending · business.approve · business.addMember · business.runPayroll</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── accounts ───────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.accounts') }}</h2>
        <span class="ix-sub">business.list</span>
      </div>
      <IxState :loading="accounts.loading" :reason="accounts.reason" :message="accounts.message" endpoint="/api/bank/trpc/business.list">
        <div v-if="accounts.data && accounts.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.business.name') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.business.spendThreshold') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in accounts.data" :key="a.id">
                <td>{{ a.name }}</td>
                <td>{{ a.assetId }}</td>
                <td>{{ a.spendThreshold }}</td>
                <td>{{ a.status }}</td>
                <td>
                  <Button size="small" @click="selectAccount(a)">{{ $t('intafaced.bank.manage') }}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.noAccounts') }}</div>
      </IxState>
    </div>

    <!-- ── create ─────────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.create') }}</h2>
        <span class="ix-sub">business.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.createLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-biz-name">{{ $t('intafaced.bank.business.name') }}</label>
          <Input element-id="ix-biz-name" v-model="createForm.name" :placeholder="$t('intafaced.bank.business.nameHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-biz-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-biz-asset" v-model="createForm.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-biz-threshold">{{ $t('intafaced.bank.business.spendThreshold') }}</label>
          <Input element-id="ix-biz-threshold" v-model="createForm.spendThreshold" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="created.busy" :disabled="!canCreate" @click="submitCreate">
          {{ $t('intafaced.bank.business.create') }}
        </Button>
      </div>
      <div v-if="created.ran" style="margin-top:14px;">
        <div v-if="created.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.created') }}</strong>
          <div style="margin-top:6px;">{{ created.data.name }} · {{ created.data.id }} · {{ created.data.spendThreshold }}</div>
        </div>
        <IxState v-else :loading="created.busy" :reason="created.reason" :message="created.message" endpoint="/api/bank/trpc/business.create"></IxState>
      </div>
    </div>

    <!-- ── propose ────────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.propose') }}</h2>
        <span class="ix-sub">business.proposeTransfer</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.proposeLead') }}</p>

      <div v-if="!(accounts.data && accounts.data.length)" class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.needAccount') }}</div>
      <IxState v-else :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
        <div v-if="spaces.data && spaces.data.length">
          <div class="ix-field-grid">
            <div class="ix-field">
              <label>{{ $t('intafaced.bank.business.accounts') }}</label>
              <Select v-model="propose.accountId" :placeholder="$t('intafaced.bank.business.needAccount')" @on-change="onProposeAccount">
                <Option v-for="a in accounts.data" :key="a.id" :value="a.id" :label="a.name + ' · ' + a.assetId + ' · ' + a.spendThreshold"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label>{{ $t('intafaced.bank.fromSpace') }}</label>
              <Select v-model="propose.fromSpaceId" :placeholder="$t('intafaced.bank.chooseSpace')">
                <Option v-for="s in spaces.data" :key="s.id" :value="s.id" :label="s.name + ' · ' + s.assetId + ' · ' + s.balance"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label for="ix-biz-to">{{ $t('intafaced.bank.toSpace') }}</label>
              <Input element-id="ix-biz-to" v-model="propose.toSpaceId" :placeholder="$t('intafaced.bank.spaceIdHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-biz-amount">{{ $t('intafaced.pay.amount') }}</label>
              <Input element-id="ix-biz-amount" v-model="propose.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
          </div>
          <div class="ix-actions">
            <Button type="primary" :loading="proposed.busy" :disabled="!canPropose" @click="submitPropose">
              {{ $t('intafaced.bank.business.propose') }}
            </Button>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.needSpace') }}</div>
      </IxState>

      <div v-if="proposed.ran" style="margin-top:14px;">
        <div v-if="proposed.reason === 'ok' && proposed.data.kind === 'pending'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.proposedPending') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.business.kindPending') }} · {{ proposed.data.approval.amount }} · {{ proposed.data.approval.id }}</div>
        </div>
        <div v-else-if="proposed.reason === 'ok' && proposed.data.kind === 'posted'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.proposedPosted') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.business.kindPosted') }} · {{ $t('intafaced.bank.ledgerTx') }}: {{ proposed.data.ledgerTxId }}</div>
        </div>
        <IxState v-else-if="proposed.reason !== 'ok'" :loading="proposed.busy" :reason="proposed.reason" :message="proposed.message" endpoint="/api/bank/trpc/business.proposeTransfer"></IxState>
      </div>
    </div>

    <!-- ── pending ────────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.pending') }}</h2>
        <span class="ix-sub">business.pending</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.pendingLead') }}</p>
      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">{{ $t('intafaced.bank.business.selfApprove') }}</div>

      <div v-if="!selectedAccountId" class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.needAccount') }}</div>
      <IxState v-else :loading="pending.loading" :reason="pending.reason" :message="pending.message" endpoint="/api/bank/trpc/business.pending">
        <div v-if="pending.data && pending.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.fromSpace') }}</th>
                <th>{{ $t('intafaced.bank.toSpace') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in pending.data" :key="p.id">
                <td>{{ p.amount }}</td>
                <td>{{ p.assetId }}</td>
                <td>{{ p.fromSpaceId }}</td>
                <td>{{ p.toSpaceId }}</td>
                <td>{{ p.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button
                      size="small"
                      :loading="approved.busy && actingId === p.id"
                      @click="submitApprove(p)"
                    >{{ $t('intafaced.bank.business.approve') }}</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.noPending') }}</div>
      </IxState>

      <div v-if="approved.ran" style="margin-top:14px;">
        <div v-if="approved.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.approved') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.ledgerTx') }}: {{ approved.data.ledgerTxId }}</div>
        </div>
        <IxState v-else :loading="approved.busy" :reason="approved.reason" :message="approved.message" endpoint="/api/bank/trpc/business.approve"></IxState>
      </div>
    </div>

    <!-- ── payroll ────────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.payroll') }}</h2>
        <span class="ix-sub">business.runPayroll</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.payrollLead') }}</p>
      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">{{ $t('intafaced.bank.business.payrollRateUnset') }}</div>

      <div v-if="!(accounts.data && accounts.data.length)" class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.needAccount') }}</div>
      <IxState v-else :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
        <div v-if="spaces.data && spaces.data.length">
          <div class="ix-field-grid">
            <div class="ix-field">
              <label>{{ $t('intafaced.bank.business.accounts') }}</label>
              <Select v-model="payroll.accountId" :placeholder="$t('intafaced.bank.business.needAccount')">
                <Option v-for="a in accounts.data" :key="'p-' + a.id" :value="a.id" :label="a.name + ' · ' + a.assetId"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label>{{ $t('intafaced.bank.business.payrollFrom') }}</label>
              <Select v-model="payroll.fromSpaceId" :placeholder="$t('intafaced.bank.chooseSpace')">
                <Option v-for="s in spaces.data" :key="'pf-' + s.id" :value="s.id" :label="s.name + ' · ' + s.assetId + ' · ' + s.balance"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label for="ix-biz-pay-to-1">{{ $t('intafaced.bank.business.payrollRecipient') }} 1</label>
              <Input element-id="ix-biz-pay-to-1" v-model="payroll.toSpaceId1" :placeholder="$t('intafaced.bank.spaceIdHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-biz-pay-amt-1">{{ $t('intafaced.pay.amount') }} 1</label>
              <Input element-id="ix-biz-pay-amt-1" v-model="payroll.amount1" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-biz-pay-to-2">{{ $t('intafaced.bank.business.payrollRecipient') }} 2</label>
              <Input element-id="ix-biz-pay-to-2" v-model="payroll.toSpaceId2" :placeholder="$t('intafaced.bank.spaceIdHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-biz-pay-amt-2">{{ $t('intafaced.pay.amount') }} 2</label>
              <Input element-id="ix-biz-pay-amt-2" v-model="payroll.amount2" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
          </div>
          <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
            {{ $t('intafaced.bank.transfersPage.idempotency') }} <code>{{ draftId('payroll') }}</code>
          </div>
          <div class="ix-actions">
            <Button type="primary" :loading="payrollRan.busy" :disabled="!canPayroll" @click="submitPayroll">
              {{ $t('intafaced.bank.business.payroll') }}
            </Button>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.needSpace') }}</div>
      </IxState>

      <div v-if="payrollRan.ran" style="margin-top:14px;">
        <div v-if="payrollRan.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.payrollRan') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.ledgerTx') }}: {{ payrollRan.data.ledgerTxId }}</div>
        </div>
        <IxState v-else :loading="payrollRan.busy" :reason="payrollRan.reason" :message="payrollRan.message" endpoint="/api/bank/trpc/business.runPayroll"></IxState>
      </div>
    </div>

    <!-- ── add a checker ──────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.addMember') }}</h2>
        <span class="ix-sub">business.addMember</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.addMemberLead') }}</p>
      <div v-if="!(accounts.data && accounts.data.length)" class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.needAccount') }}</div>
      <div v-else>
        <div class="ix-field-grid">
          <div class="ix-field">
            <label>{{ $t('intafaced.bank.business.accounts') }}</label>
            <Select v-model="member.accountId" :placeholder="$t('intafaced.bank.business.needAccount')">
              <Option v-for="a in accounts.data" :key="'m-' + a.id" :value="a.id" :label="a.name + ' · ' + a.assetId"></Option>
            </Select>
          </div>
          <div class="ix-field">
            <label for="ix-biz-user">{{ $t('intafaced.bank.business.userId') }}</label>
            <Input element-id="ix-biz-user" v-model="member.userId" :placeholder="$t('intafaced.bank.business.userIdHint')"></Input>
          </div>
          <div class="ix-field">
            <label>{{ $t('intafaced.bank.business.role') }}</label>
            <Select v-model="member.role">
              <Option value="checker" :label="$t('intafaced.bank.business.roleChecker')"></Option>
              <Option value="maker" :label="$t('intafaced.bank.business.roleMaker')"></Option>
              <Option value="admin" :label="$t('intafaced.bank.business.roleAdmin')"></Option>
            </Select>
          </div>
        </div>
        <div class="ix-actions">
          <Button type="primary" :loading="memberAdded.busy" :disabled="!canAddMember" @click="submitAddMember">
            {{ $t('intafaced.bank.business.addMember') }}
          </Button>
        </div>
      </div>
      <div v-if="memberAdded.ran" style="margin-top:14px;">
        <div v-if="memberAdded.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.memberAdded') }}</strong>
          <div style="margin-top:6px;">{{ memberAdded.data.userId }} · {{ memberAdded.data.role }}</div>
        </div>
        <IxState v-else :loading="memberAdded.busy" :reason="memberAdded.reason" :message="memberAdded.message" endpoint="/api/bank/trpc/business.addMember"></IxState>
      </div>
    </div>

    <!-- ── expense cards (reuse bank.cards; simulated: true is visible) ── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.expenseTitle') }}</h2>
        <span class="ix-sub">{{ $t('intafaced.bank.business.expenseApi') }}</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.expenseLead') }}</p>
      <div class="ix-note" style="margin-bottom:14px;">
        <strong>{{ $t('intafaced.bank.simulated') }}</strong>
        <span v-if="issuedCard.data">: {{ issuedCard.data.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</span>
        <span v-else>: {{ $t('intafaced.bank.business.expenseSimulated') }}</span>
      </div>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-biz-card-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-biz-card-asset" v-model="expenseForm.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-biz-card-limit">{{ $t('intafaced.bank.perAuthLimit') }}</label>
          <Input element-id="ix-biz-card-limit" v-model="expenseForm.perAuthorizationLimit" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
      </div>
      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.bank.transfersPage.idempotency') }} <code>{{ draftId('expense-card') }}</code>
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="issuedCard.busy" :disabled="!canIssueExpense" @click="submitExpenseCard">{{ $t('intafaced.bank.business.expenseIssue') }}</Button>
      </div>
      <div v-if="issuedCard.ran" style="margin-top:14px;">
        <div v-if="issuedCard.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.cardIssued') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.simulated') }}: {{ issuedCard.data.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</div>
        </div>
        <IxState v-else :loading="issuedCard.busy" :reason="issuedCard.reason" :message="issuedCard.message" endpoint="/api/bank/trpc/cards.issue"></IxState>
      </div>
    </div>

    <!-- ── invoice (reuse pay.gateway createLink; no second book) ─────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.business.invoiceTitle') }}</h2>
        <span class="ix-sub">{{ $t('intafaced.bank.business.invoiceApi') }}</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.business.invoiceLead') }}</p>
      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">{{ $t('intafaced.bank.business.invoiceSocket') }}</div>
      <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
        <div v-if="!invoiceMerchantId" class="ix-note ix-note-quiet">{{ $t('intafaced.bank.business.invoiceNeedMerchant') }}</div>
        <div v-else>
          <div class="ix-field-grid">
            <div class="ix-field">
              <label for="ix-biz-inv-label">{{ $t('intafaced.pay.linkLabel') }}</label>
              <Input element-id="ix-biz-inv-label" v-model="invoiceForm.label" :placeholder="$t('intafaced.bank.business.invoiceLabelHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-biz-inv-amount">{{ $t('intafaced.pay.amount') }}</label>
              <Input element-id="ix-biz-inv-amount" v-model="invoiceForm.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-biz-inv-currency">{{ $t('intafaced.pay.currency') }}</label>
              <Input element-id="ix-biz-inv-currency" v-model="invoiceForm.currency" :placeholder="$t('intafaced.bank.assetHint')"></Input>
            </div>
          </div>
          <div class="ix-actions">
            <Button type="primary" :loading="issuedInvoice.busy" :disabled="!canIssueInvoice" @click="submitInvoice">{{ $t('intafaced.bank.business.invoiceIssue') }}</Button>
          </div>
        </div>
      </IxState>
      <div v-if="issuedInvoice.ran" style="margin-top:14px;">
        <div v-if="issuedInvoice.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.business.invoiceIssued') }}</strong>
          <div style="margin-top:10px;">{{ $t('intafaced.pay.tokenOnce') }}</div>
          <div style="margin-top:8px;"><code>{{ issuedInvoice.data.token }}</code></div>
        </div>
        <IxState v-else :loading="issuedInvoice.busy" :reason="issuedInvoice.reason" :message="issuedInvoice.message" endpoint="/api/pay/trpc/merchant.createLink"></IxState>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * BUSINESS — svc-bank's `business` router.
 *
 * Dual control: under the account's spend threshold a propose posts; at or
 * above, funds sit on a purposed hold until a checker approves. The
 * maker-cannot-approve-self refusal is `bank.business_self_approve`. Payroll is
 * one ledger post for every recipient (or none). Mixed assets refuse
 * `bank.business_payroll_rate_unset`. Amounts are decimal strings end to end.
 * Expense cards reuse `cards.issue`; `simulated: true` is drawn, never hidden.
 * Invoices reuse `merchant.createLink` (pay.gateway). Token is shown once; no
 * checkout origin is assembled here. Card acquiring stays socket.psp-partners.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankBusiness',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      selectedAccountId: '',
      actingId: '',
      createForm: { name: '', assetId: '', spendThreshold: '' },
      propose: { accountId: '', fromSpaceId: '', toSpaceId: '', amount: '' },
      payroll: { accountId: '', fromSpaceId: '', toSpaceId1: '', amount1: '', toSpaceId2: '', amount2: '' },
      member: { accountId: '', userId: '', role: 'checker' },
      accounts: this.emptySection(),
      spaces: this.emptySection(),
      pending: this.emptySection(),
      created: this.emptyAction(),
      proposed: this.emptyAction(),
      approved: this.emptyAction(),
      payrollRan: this.emptyAction(),
      memberAdded: this.emptyAction(),
      expenseForm: { assetId: '', perAuthorizationLimit: '' },
      issuedCard: this.emptyAction(),
      invoiceForm: { label: '', amount: '', currency: '' },
      merchant: this.emptySection(),
      issuedInvoice: this.emptyAction()
    };
  },
  computed: {
    canCreate() {
      return Boolean(this.createForm.name && this.createForm.assetId && this.createForm.spendThreshold);
    },
    canPropose() {
      return Boolean(this.propose.accountId && this.propose.fromSpaceId && this.propose.toSpaceId && this.propose.amount);
    },
    canAddMember() {
      return Boolean(this.member.accountId && this.member.userId && this.member.role);
    },
    canIssueExpense() {
      return Boolean(this.expenseForm.assetId && this.expenseForm.perAuthorizationLimit && this.draftId('expense-card'));
    },
    canPayroll() {
      return Boolean(
        this.payroll.accountId &&
          this.payroll.fromSpaceId &&
          this.payroll.toSpaceId1 &&
          this.payroll.amount1 &&
          this.payroll.toSpaceId2 &&
          this.payroll.amount2 &&
          this.draftId('payroll')
      );
    },
    invoiceMerchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    },
    canIssueInvoice() {
      return Boolean(this.invoiceMerchantId && this.invoiceForm.label);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.reloadAccounts();
    this.load('spaces', query('bank', 'spaces.list', {}, this.ixToken));
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken));
  },
  methods: {
    reloadAccounts() {
      var self = this;
      this.load('accounts', query('bank', 'business.list', undefined, this.ixToken)).then(function(res) {
        if (!res || !res.ok || !self.accounts.data || !self.accounts.data.length) return;
        if (!self.selectedAccountId) self.selectAccount(self.accounts.data[0]);
      });
    },
    selectAccount(account) {
      if (!account) return;
      this.selectedAccountId = account.id;
      this.propose.accountId = account.id;
      this.payroll.accountId = account.id;
      this.member.accountId = account.id;
      this.reloadPending();
    },
    onProposeAccount(accountId) {
      this.selectedAccountId = accountId;
      this.member.accountId = accountId;
      if (accountId) this.reloadPending();
    },
    reloadPending() {
      if (!this.selectedAccountId) {
        this.pending = this.emptySection();
        this.pending.loading = false;
        this.pending.reason = 'ok';
        this.pending.data = [];
        return;
      }
      this.load('pending', query('bank', 'business.pending', { accountId: this.selectedAccountId }, this.ixToken));
    },
    submitCreate() {
      var self = this;
      if (!this.canCreate) return;
      this.act(
        'created',
        mutate('bank', 'business.create', {
            name: this.createForm.name,
            assetId: this.createForm.assetId,
            spendThreshold: this.createForm.spendThreshold
          }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.createForm = { name: '', assetId: '', spendThreshold: '' };
        self.load('accounts', query('bank', 'business.list', undefined, self.ixToken)).then(function(listRes) {
          if (!listRes || !listRes.ok) return;
          if (res.data && res.data.id) self.selectAccount(res.data);
        });
      });
    },
    submitPropose() {
      var self = this;
      if (!this.canPropose) return;
      this.act(
        'proposed',
        mutate('bank', 'business.proposeTransfer', {
            accountId: this.propose.accountId,
            fromSpaceId: this.propose.fromSpaceId,
            toSpaceId: this.propose.toSpaceId,
            amount: this.propose.amount
          }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.selectedAccountId = self.propose.accountId;
        self.propose.amount = '';
        self.reloadPending();
        self.load('spaces', query('bank', 'spaces.list', {}, self.ixToken));
      });
    },
    submitApprove(row) {
      var self = this;
      if (!row) return;
      this.actingId = row.id;
      this.act('approved', mutate('bank', 'business.approve', { approvalId: row.id }, this.ixToken)).then(function(res) {
        self.actingId = '';
        if (!res.ok) return;
        self.reloadPending();
        self.load('spaces', query('bank', 'spaces.list', {}, self.ixToken));
      });
    },
    submitPayroll() {
      var self = this;
      if (!this.canPayroll) return;
      this.act(
        'payrollRan',
        mutate('bank', 'business.runPayroll', {
            payrollId: this.draftId('payroll'),
            accountId: this.payroll.accountId,
            fromSpaceId: this.payroll.fromSpaceId,
            recipients: [
              { toSpaceId: this.payroll.toSpaceId1, amount: this.payroll.amount1 },
              { toSpaceId: this.payroll.toSpaceId2, amount: this.payroll.amount2 }
            ]
          }, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('payroll');
        self.payroll.amount1 = '';
        self.payroll.amount2 = '';
        self.load('spaces', query('bank', 'spaces.list', {}, self.ixToken));
      });
    },
    submitAddMember() {
      var self = this;
      if (!this.canAddMember) return;
      this.act(
        'memberAdded',
        mutate(
          'bank',
          'business.addMember',
          {
            accountId: this.member.accountId,
            userId: this.member.userId,
            role: this.member.role
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.member.userId = '';
      });
    },
    submitExpenseCard() {
      var self = this;
      if (!this.canIssueExpense) return;
      this.act(
        'issuedCard',
        mutate(
          'bank',
          'cards.issue',
          {
            cardId: this.draftId('expense-card'),
            assetId: this.expenseForm.assetId,
            perAuthorizationLimit: this.expenseForm.perAuthorizationLimit
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('expense-card');
        self.expenseForm = { assetId: '', perAuthorizationLimit: '' };
      });
    },
    submitInvoice() {
      var self = this;
      if (!this.canIssueInvoice) return;
      var input = { merchantId: this.invoiceMerchantId, label: this.invoiceForm.label };
      if (this.invoiceForm.amount) input.amount = this.invoiceForm.amount;
      if (this.invoiceForm.currency) input.currency = this.invoiceForm.currency;
      this.act('issuedInvoice', mutate('pay', 'merchant.createLink', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.invoiceForm = { label: '', amount: '', currency: '' };
      });
    }
  }
};
</script>
