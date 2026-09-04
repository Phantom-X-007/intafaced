<template>
  <div class="ix-page bank-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.cardsPage.title') }}</h1>
      <p>{{ $t('intafaced.bank.cardsPage.lead') }}</p>
      <span class="bank-programme-status">Simulated · no live issuer</span>
      <details class="bank-details"><summary>Details</summary><code>svc-bank · cards.programme · cards.list · cards.issue · cards.setStatus · cards.authorizations · autoInvest.list · autoInvest.createRoundUp · autoInvest.pause · autoInvest.resume · autoInvest.cancel</code></details>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── what programme this deployment has, INCLUDING none ──────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.programme') }}</h2>
        <span class="ix-sub">cards.programme</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.cardsPage.programmeLead') }}</p>
      <IxState compact :loading="programme.loading" :reason="programme.reason" :message="programme.message" endpoint="/api/bank/trpc/cards.programme">
        <div v-if="programme.data">
          <div class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.programmeId') }}</span>
              <span class="v" style="font-size:15px;">{{ programme.data.id }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.programmeName') }}</span>
              <span class="v" style="font-size:15px;">{{ programme.data.displayName }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.simulated') }}</span>
              <span class="v" style="font-size:15px;">
                {{ programme.data.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}
              </span>
            </div>
          </div>
          <div v-if="programme.data.simulated" class="ix-note" style="margin-top:16px;">
            <strong>{{ $t('intafaced.bank.cardsPage.simulatedTitle') }}</strong>
            <div style="margin-top:6px;">{{ $t('intafaced.bank.cardsPage.simulatedBody') }}</div>
          </div>
        </div>
      </IxState>
    </div>

    <!-- ── my cards ───────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.myCards') }}</h2>
        <span class="ix-sub">cards.list</span>
      </div>
      <IxState compact :loading="cards.loading" :reason="cards.reason" :message="cards.message" endpoint="/api/bank/trpc/cards.list">
        <div v-if="cards.data && cards.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.panTail') }}</th>
                <th>{{ $t('intafaced.bank.issuer') }}</th>
                <th>{{ $t('intafaced.bank.simulated') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.bank.cashback') }}</th>
                <th>{{ $t('intafaced.bank.perAuthLimit') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in cards.data" :key="c.id">
                <td>{{ c.assetId }}</td>
                <td>{{ c.panTail }}</td>
                <td>{{ c.issuer }}</td>
                <td>{{ c.simulated ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                <td>{{ c.status }}</td>
                <td>{{ bps(c.cashbackBps) }}</td>
                <td>{{ c.perAuthorizationLimit }}</td>
                <td>
                  <div class="ix-actions">
                    <Button v-if="c.status === 'active'" size="small" @click="setStatus(c, 'frozen')">{{ $t('intafaced.bank.freeze') }}</Button>
                    <Button v-if="c.status === 'frozen'" size="small" @click="setStatus(c, 'active')">{{ $t('intafaced.bank.unfreeze') }}</Button>
                    <Button v-if="c.status !== 'closed'" size="small" @click="setStatus(c, 'closed')">{{ $t('intafaced.bank.closeCard') }}</Button>
                    <Button size="small" @click="showAuthorizations(c)">{{ $t('intafaced.bank.decisions') }}</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noCards') }}</div>
      </IxState>

      <div v-if="statusSet.ran" style="margin-top:14px;">
        <div v-if="statusSet.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.cardUpdated') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.status') }}: {{ statusSet.data.status }}</div>
        </div>
        <IxState compact v-else :loading="statusSet.busy" :reason="statusSet.reason" :message="statusSet.message" endpoint="/api/bank/trpc/cards.setStatus"></IxState>
      </div>
    </div>

    <!-- ── issue a card ───────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.issueCard') }}</h2>
        <span class="ix-sub">cards.issue</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.cardsPage.issueLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-card-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-card-asset" v-model="issueForm.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-card-limit">{{ $t('intafaced.bank.perAuthLimit') }}</label>
          <Input element-id="ix-card-limit" v-model="issueForm.perAuthorizationLimit" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
      </div>
      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        {{ $t('intafaced.bank.transfersPage.idempotency') }} <code>{{ draftId('card') }}</code>
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="issued.busy" :disabled="!canIssue" @click="submitIssue">{{ $t('intafaced.bank.issueCard') }}</Button>
      </div>

      <div v-if="issued.ran" style="margin-top:14px;">
        <div v-if="issued.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.cardIssued') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.panTail') }}: {{ issued.data.panTail }}</div>
        </div>
        <IxState compact v-else :loading="issued.busy" :reason="issued.reason" :message="issued.message" endpoint="/api/bank/trpc/cards.issue"></IxState>
      </div>
    </div>

    <!-- ── card round-up rules ─────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.cardsPage.roundUpList') }}</h2>
        <span class="ix-sub">autoInvest.list</span>
      </div>
      <IxState compact :loading="roundUps.loading" :reason="roundUps.reason" :message="roundUps.message" endpoint="/api/bank/trpc/autoInvest.list">
        <div v-if="roundUpRules.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.cardsPage.roundUpId') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.cardsPage.roundUpGranularity') }}</th>
                <th>{{ $t('intafaced.bank.poolName') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in roundUpRules" :key="r.id">
                <td>{{ r.id }}</td>
                <td>{{ r.assetId }}</td>
                <td>{{ r.amount }}</td>
                <td>{{ r.targetPoolId }}</td>
                <td>{{ r.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button v-if="r.status === 'active'" size="small" :loading="ruleAct.busy && actingRuleId === r.id" @click="pauseRoundUp(r)">{{ $t('intafaced.bank.autoInvest.pause') }}</Button>
                    <Button v-if="r.status === 'paused'" size="small" :loading="ruleAct.busy && actingRuleId === r.id" @click="resumeRoundUp(r)">{{ $t('intafaced.bank.autoInvest.resume') }}</Button>
                    <Button v-if="r.status !== 'cancelled'" size="small" :loading="ruleAct.busy && actingRuleId === r.id" @click="cancelRoundUp(r)">{{ $t('intafaced.bank.autoInvest.cancel') }}</Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.cardsPage.roundUpEmpty') }}</div>
      </IxState>

      <div v-if="ruleAct.ran" style="margin-top:14px;">
        <div v-if="ruleAct.reason === 'ok'" class="ix-done">
          <strong>{{ ruleActDoneLabel }}</strong>
          <div v-if="ruleAct.data && ruleAct.data.status" style="margin-top:6px;">{{ $t('intafaced.bank.status') }}: {{ ruleAct.data.status }}</div>
        </div>
        <IxState compact v-else :loading="ruleAct.busy" :reason="ruleAct.reason" :message="ruleAct.message" :endpoint="ruleActEndpoint"></IxState>
      </div>
    </div>

    <!-- ── create a card round-up ─────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.cardsPage.roundUpTitle') }}</h2>
        <span class="ix-sub">autoInvest.createRoundUp</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.cardsPage.roundUpLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-roundup-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-roundup-asset" v-model="roundUpForm.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-roundup-granularity">{{ $t('intafaced.bank.cardsPage.roundUpGranularity') }}</label>
          <Input element-id="ix-roundup-granularity" v-model="roundUpForm.granularity" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-roundup-pool">{{ $t('intafaced.bank.cardsPage.roundUpPool') }}</label>
          <Input element-id="ix-roundup-pool" v-model="roundUpForm.targetPoolId" :placeholder="$t('intafaced.bank.cardsPage.roundUpPoolHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-roundup-buy">{{ $t('intafaced.bank.cardsPage.roundUpBuyAsset') }}</label>
          <Input element-id="ix-roundup-buy" v-model="roundUpForm.buyAssetId" :placeholder="$t('intafaced.bank.cardsPage.roundUpBuyAssetHint')"></Input>
        </div>
      </div>
      <div v-if="roundUpCrossAsset" class="ix-note" style="margin-bottom:14px;">
        {{ $t('intafaced.bank.cardsPage.roundUpRateUnset') }}
      </div>
      <div class="ix-actions">
        <Button type="primary" :loading="roundUpCreated.busy" :disabled="!canCreateRoundUp" @click="submitRoundUp">{{ $t('intafaced.bank.cardsPage.roundUpCreate') }}</Button>
      </div>

      <div v-if="roundUpCreated.ran" style="margin-top:14px;">
        <div v-if="roundUpCreated.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.cardsPage.roundUpCreated') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.cardsPage.roundUpId') }}: {{ roundUpCreated.data.id }}</div>
        </div>
        <IxState compact v-else :loading="roundUpCreated.busy" :reason="roundUpCreated.reason" :message="roundUpCreated.message" endpoint="/api/bank/trpc/autoInvest.createRoundUp"></IxState>
      </div>
    </div>

    <!-- ── every decision on one card ─────────────────────────────────── -->
    <div v-if="openCardId" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.decisions') }}</h2>
        <span class="ix-sub">cards.authorizations</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.cardsPage.decisionsLead') }}</p>
      <IxState compact :loading="authorizations.loading" :reason="authorizations.reason" :message="authorizations.message" endpoint="/api/bank/trpc/cards.authorizations">
        <div v-if="authorizations.data && authorizations.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.created') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.merchantCategory') }}</th>
                <th>{{ $t('intafaced.bank.decision') }}</th>
                <th>{{ $t('intafaced.bank.declineCode') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.bank.authorizationRef') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in authorizations.data" :key="a.id">
                <td>{{ a.decidedAt }}</td>
                <td>{{ a.amount }}</td>
                <td>{{ a.merchantCategory === null ? '—' : a.merchantCategory }}</td>
                <td>{{ a.decision }}</td>
                <td>{{ a.declineCode === null ? '—' : a.declineCode }}</td>
                <td>{{ a.status }}</td>
                <td>{{ a.authorizationRef }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noAuthorizations') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * CARDS — svc-bank's `cards` router, every user-facing procedure.
 *
 * ── `simulated` IS RENDERED, NOT HIDDEN ───────────────────────────────────
 * The router puts `simulated` on the programme and on every card and calls it
 * non-optional: "a screen rendering a card from this router cannot accidentally
 * present it as a real one". This screen prints it in the programme readout, in
 * a column on every card, and as a standing note when the programme is a
 * simulator. A simulated card drawn like a real one is the single worst thing
 * this page could do.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────
 * There is no authorize, capture or reverse control. Those three are the ISSUER
 * speaking, they live in `ops` behind `admin:treasury`, and the router explains
 * why: a user who can approve their own authorisation can approve a purchase
 * the ledger would have declined. `cards.authorizations` is here instead — the
 * DECLINES are the point, because "why was I declined at the till" is the
 * question a card generates.
 *
 * `cardId` is client-supplied so a retried issue is the same card, not a second
 * one drawing on the same balance (§5).
 *
 * Card round-up is the user-facing auto-invest door on this page. Granularity
 * is a decimal string. `buyAssetId` is omitted unless it matches `assetId`; a
 * different buy asset surfaces `bank.auto_invest_rate_unset` and is not sent —
 * this screen does not invent a convert rate.
 *
 * Pause / resume / cancel send {ruleId} to autoInvest.pause / resume / cancel.
 * Pause does not invent missed windows. Cancel does not reverse past runs.
 * `bank.not_owner` stays named via IxState.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';
import ixMoney from '../../../assets/js/ix-money.js';

export default {
  name: 'IxBankCards',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      openCardId: '',
      issueForm: { assetId: '', perAuthorizationLimit: '' },
      roundUpForm: { assetId: '', granularity: '', targetPoolId: '', buyAssetId: '' },
      programme: this.emptySection(),
      cards: this.emptySection(),
      authorizations: this.emptySection(),
      roundUps: this.emptySection(),
      issued: this.emptyAction(),
      statusSet: this.emptyAction(),
      roundUpCreated: this.emptyAction(),
      ruleAct: this.emptyAction(),
      actingRuleId: '',
      ruleActKind: 'pause',
      ruleActEndpoint: '/api/bank/trpc/autoInvest.pause'
    };
  },
  computed: {
    canIssue() {
      return Boolean(this.issueForm.assetId && this.issueForm.perAuthorizationLimit && this.draftId('card'));
    },
    canCreateRoundUp() {
      return Boolean(this.roundUpForm.assetId && this.roundUpForm.granularity && this.roundUpForm.targetPoolId);
    },
    roundUpCrossAsset() {
      var buy = this.roundUpForm.buyAssetId;
      return Boolean(buy && buy !== this.roundUpForm.assetId);
    },
    roundUpRules() {
      var rows = this.roundUps.data;
      if (!rows || !rows.length) return [];
      return rows.filter(function(r) {
        return r.kind === 'card_roundup';
      });
    },
    ruleActDoneLabel() {
      if (this.ruleActKind === 'resume') return this.$t('intafaced.bank.autoInvest.resumeDone');
      if (this.ruleActKind === 'cancel') return this.$t('intafaced.bank.autoInvest.cancelDone');
      return this.$t('intafaced.bank.autoInvest.pauseDone');
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('programme', query('bank', 'cards.programme', undefined, this.ixToken));
    this.reloadCards();
    this.reloadRoundUps();
  },
  methods: {
    bps(value) {
      /* Integer bps → percent label via ix-money divide. Unreadable is a dash,
         never IEEE Number math and never a fabricated 0 rate. */
      if (value === null || value === undefined || value === '') return '—';
      var pct = ixMoney.divide(value, '100', 2);
      return pct === null ? '—' : pct + '%';
    },
    reloadCards() {
      this.load('cards', query('bank', 'cards.list', undefined, this.ixToken));
    },
    submitIssue() {
      var self = this;
      if (!this.canIssue) return;
      this.act(
        'issued',
        mutate(
          'bank',
          'cards.issue',
          {
            cardId: this.draftId('card'),
            assetId: this.issueForm.assetId,
            perAuthorizationLimit: this.issueForm.perAuthorizationLimit
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.clearDraftId('card');
        self.issueForm = { assetId: '', perAuthorizationLimit: '' };
        self.reloadCards();
      });
    },
    setStatus(card, status) {
      var self = this;
      this.act('statusSet', mutate('bank', 'cards.setStatus', { cardId: card.id, status: status }, this.ixToken)).then(function(res) {
        if (res.ok) self.reloadCards();
      });
    },
    showAuthorizations(card) {
      this.openCardId = card.id;
      this.load('authorizations', query('bank', 'cards.authorizations', { cardId: card.id }, this.ixToken));
    },
    reloadRoundUps() {
      this.load('roundUps', query('bank', 'autoInvest.list', undefined, this.ixToken));
    },
    pauseRoundUp(rule) {
      var self = this;
      if (!rule || this.ruleAct.busy) return;
      this.actingRuleId = rule.id;
      this.ruleActKind = 'pause';
      this.ruleActEndpoint = '/api/bank/trpc/autoInvest.pause';
      this.act('ruleAct', mutate('bank', 'autoInvest.pause', { ruleId: rule.id }, this.ixToken)).then(function(res) {
        self.actingRuleId = '';
        if (res.ok) self.reloadRoundUps();
      });
    },
    resumeRoundUp(rule) {
      var self = this;
      if (!rule || this.ruleAct.busy) return;
      this.actingRuleId = rule.id;
      this.ruleActKind = 'resume';
      this.ruleActEndpoint = '/api/bank/trpc/autoInvest.resume';
      this.act('ruleAct', mutate('bank', 'autoInvest.resume', { ruleId: rule.id }, this.ixToken)).then(function(res) {
        self.actingRuleId = '';
        if (res.ok) self.reloadRoundUps();
      });
    },
    cancelRoundUp(rule) {
      var self = this;
      if (!rule || this.ruleAct.busy) return;
      this.actingRuleId = rule.id;
      this.ruleActKind = 'cancel';
      this.ruleActEndpoint = '/api/bank/trpc/autoInvest.cancel';
      this.act('ruleAct', mutate('bank', 'autoInvest.cancel', { ruleId: rule.id }, this.ixToken)).then(function(res) {
        self.actingRuleId = '';
        if (res.ok) self.reloadRoundUps();
      });
    },
    submitRoundUp() {
      var self = this;
      if (!this.canCreateRoundUp) return;
      var buy = this.roundUpForm.buyAssetId;
      var assetId = this.roundUpForm.assetId;
      if (buy && buy !== assetId) {
        this.roundUpCreated = {
          busy: false,
          ran: true,
          reason: 'error',
          message: 'bank.auto_invest_rate_unset',
          data: null
        };
        return;
      }
      var input = {
        assetId: assetId,
        granularity: this.roundUpForm.granularity,
        targetPoolId: this.roundUpForm.targetPoolId
      };
      if (buy) input.buyAssetId = buy;
      this.act(
        'roundUpCreated',
        mutate('bank', 'autoInvest.createRoundUp', input, this.ixToken)
      ).then(function(res) {
        if (!res.ok) return;
        self.roundUpForm = { assetId: '', granularity: '', targetPoolId: '', buyAssetId: '' };
        self.reloadRoundUps();
      });
    }
  }
};
</script>
