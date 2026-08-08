<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.transfersPage.title') }}</h1>
      <p>{{ $t('intafaced.bank.transfersPage.lead') }}</p>
      <div class="ix-source">svc-bank · transfers.create · transfers.schedule · transfers.listSchedules · transfers.executions · transfers.pause · transfers.resume · transfers.cancel</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── one-off transfer ────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.transfersPage.oneOff') }}</h2>
        <span class="ix-sub">transfers.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.transfersPage.oneOffLead') }}</p>

      <IxState :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
        <div v-if="spaces.data && spaces.data.length">
          <div class="ix-field-grid">
            <div class="ix-field">
              <label>{{ $t('intafaced.bank.fromSpace') }}</label>
              <Select v-model="transfer.fromSpaceId" :placeholder="$t('intafaced.bank.chooseSpace')">
                <Option v-for="s in spaces.data" :key="s.id" :value="s.id" :label="s.name + ' · ' + s.assetId + ' · ' + s.balance"></Option>
              </Select>
            </div>
            <div class="ix-field">
              <label for="ix-to-space">{{ $t('intafaced.bank.toSpace') }}</label>
              <Input element-id="ix-to-space" v-model="transfer.toSpaceId" :placeholder="$t('intafaced.bank.spaceIdHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-tx-amount">{{ $t('intafaced.pay.amount') }}</label>
              <Input element-id="ix-tx-amount" v-model="transfer.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
          </div>
          <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
            {{ $t('intafaced.bank.transfersPage.idempotency') }} <code>{{ draftId('transfer') }}</code>
          </div>
          <div class="ix-actions">
            <Button type="primary" :loading="created.busy" :disabled="!canTransfer" @click="submitTransfer">
              {{ $t('intafaced.bank.send') }}
            </Button>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.transfersPage.needSpace') }}</div>
      </IxState>

      <div v-if="created.ran" style="margin-top:14px;">
        <div v-if="created.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.transferPosted') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.pay.amount') }}: {{ created.data.amount }} · {{ $t('intafaced.bank.ledgerTx') }}: {{ created.data.ledgerTxId }}</div>
        </div>
        <IxState v-else :loading="created.busy" :reason="created.reason" :message="created.message" endpoint="/api/bank/trpc/transfers.create"></IxState>
      </div>
    </div>

    <!-- ── standing order ──────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.transfersPage.standing') }}</h2>
        <span class="ix-sub">transfers.schedule</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.transfersPage.standingLead') }}</p>

      <div v-if="spaces.data && spaces.data.length">
        <div class="ix-field-grid">
          <div class="ix-field">
            <label>{{ $t('intafaced.bank.fromSpace') }}</label>
            <Select v-model="standing.fromSpaceId" :placeholder="$t('intafaced.bank.chooseSpace')">
              <Option v-for="s in spaces.data" :key="s.id" :value="s.id" :label="s.name + ' · ' + s.assetId"></Option>
            </Select>
          </div>
          <div class="ix-field">
            <label for="ix-so-to">{{ $t('intafaced.bank.toSpace') }}</label>
            <Input element-id="ix-so-to" v-model="standing.toSpaceId" :placeholder="$t('intafaced.bank.spaceIdHint')"></Input>
          </div>
          <div class="ix-field">
            <label for="ix-so-amount">{{ $t('intafaced.pay.amount') }}</label>
            <Input element-id="ix-so-amount" v-model="standing.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
          </div>
          <div class="ix-field">
            <label>{{ $t('intafaced.bank.cadence') }}</label>
            <Select v-model="standing.cadence">
              <Option value="daily" :label="$t('intafaced.bank.daily')"></Option>
              <Option value="weekly" :label="$t('intafaced.bank.weekly')"></Option>
              <Option value="monthly" :label="$t('intafaced.bank.monthly')"></Option>
            </Select>
          </div>
          <div class="ix-field">
            <label for="ix-so-start">{{ $t('intafaced.bank.startsAt') }}</label>
            <Input element-id="ix-so-start" v-model="standing.startsAt" :placeholder="$t('intafaced.bank.isoHint')"></Input>
          </div>
          <div class="ix-field">
            <label for="ix-so-end">{{ $t('intafaced.bank.endsAtOptional') }}</label>
            <Input element-id="ix-so-end" v-model="standing.endsAt" :placeholder="$t('intafaced.bank.isoHint')"></Input>
          </div>
        </div>
        <div class="ix-actions">
          <Button type="primary" :loading="scheduled.busy" :disabled="!canSchedule" @click="submitSchedule">
            {{ $t('intafaced.bank.createStanding') }}
          </Button>
        </div>
      </div>
      <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.transfersPage.needSpace') }}</div>

      <div v-if="scheduled.ran" style="margin-top:14px;">
        <div v-if="scheduled.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.standingCreated') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.nextRun') }}: {{ scheduled.data.nextRunAt }}</div>
        </div>
        <IxState v-else :loading="scheduled.busy" :reason="scheduled.reason" :message="scheduled.message" endpoint="/api/bank/trpc/transfers.schedule"></IxState>
      </div>
    </div>

    <!-- ── the standing orders that exist ──────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.schedules') }}</h2>
        <span class="ix-sub">transfers.listSchedules</span>
      </div>
      <IxState :loading="schedules.loading" :reason="schedules.reason" :message="schedules.message" endpoint="/api/bank/trpc/transfers.listSchedules">
        <div v-if="schedules.data && schedules.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.cadence') }}</th>
                <th>{{ $t('intafaced.bank.nextRun') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in schedules.data" :key="s.id">
                <td>{{ s.assetId }}</td>
                <td>{{ s.amount }}</td>
                <td>{{ s.cadence }}</td>
                <td>{{ s.nextRunAt }}</td>
                <td>{{ s.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button size="small" @click="showExecutions(s)">{{ $t('intafaced.bank.executions') }}</Button>
                    <Button
                      v-if="s.status === 'active'"
                      size="small"
                      :loading="paused.busy && actingId === s.id"
                      @click="pauseSchedule(s)"
                    >{{ $t('intafaced.bank.pause') }}</Button>
                    <Button
                      v-if="s.status === 'paused'"
                      size="small"
                      :loading="resumed.busy && actingId === s.id"
                      @click="resumeSchedule(s)"
                    >{{ $t('intafaced.bank.resume') }}</Button>
                    <Button size="small" :loading="cancelled.busy && cancellingId === s.id" @click="cancelSchedule(s)">
                      {{ $t('intafaced.bank.cancel') }}
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noSchedules') }}</div>
      </IxState>

      <div v-if="paused.ran" style="margin-top:14px;">
        <div v-if="paused.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.standingPaused') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.nextRun') }}: {{ paused.data.nextRunAt }}</div>
        </div>
        <IxState v-else :loading="paused.busy" :reason="paused.reason" :message="paused.message" endpoint="/api/bank/trpc/transfers.pause"></IxState>
      </div>

      <div v-if="resumed.ran" style="margin-top:14px;">
        <div v-if="resumed.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.standingResumed') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.bank.nextRun') }}: {{ resumed.data.nextRunAt }}</div>
          <!-- The occurrences that came due while it was paused and will never
               fire. The service returns them precisely so nobody has to infer
               them from a gap in the execution list, so they are named here
               rather than left as an absence the reader has to notice. -->
          <div style="margin-top:6px;">
            {{ resumed.data.skipped.length
              ? $t('intafaced.bank.skippedWhilePaused') + ' ' + resumed.data.skipped.join(', ')
              : $t('intafaced.bank.nothingSkipped') }}
          </div>
        </div>
        <IxState v-else :loading="resumed.busy" :reason="resumed.reason" :message="resumed.message" endpoint="/api/bank/trpc/transfers.resume"></IxState>
      </div>

      <div v-if="cancelled.ran" style="margin-top:14px;">
        <div v-if="cancelled.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.standingCancelled') }}</strong>
        </div>
        <IxState v-else :loading="cancelled.busy" :reason="cancelled.reason" :message="cancelled.message" endpoint="/api/bank/trpc/transfers.cancel"></IxState>
      </div>
    </div>

    <!-- ── what actually ran ───────────────────────────────────────────── -->
    <div v-if="openScheduleId" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.executions') }}</h2>
        <span class="ix-sub">transfers.executions</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.transfersPage.executionsLead') }}</p>
      <IxState :loading="executions.loading" :reason="executions.reason" :message="executions.message" endpoint="/api/bank/trpc/transfers.executions">
        <div v-if="executions.data && executions.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.occurrence') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.bank.ledgerTx') }}</th>
                <th>{{ $t('intafaced.bank.rejection') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in executions.data" :key="e.occurrence">
                <td>{{ e.occurrence }}</td>
                <td>{{ e.amount }}</td>
                <td>{{ e.status }}</td>
                <td>{{ e.ledgerTxId === null ? '—' : e.ledgerTxId }}</td>
                <td>{{ e.rejectionCode === null ? '—' : e.rejectionCode }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.noExecutions') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * TRANSFERS — svc-bank's `transfers` router, all five procedures.
 *
 * ── WHY `transferId` IS ON THE SCREEN ──────────────────────────────────────
 * The router takes the transfer's id from the CLIENT, deliberately: "a retried
 * request is the same transfer, not a second one" (§5). That only holds if the
 * browser keeps the id still across retries, so `draftId` mints it once per
 * draft and releases it only after svc-bank has accepted the transfer. The id
 * is printed because a money write whose idempotency key is invisible is one
 * nobody can check, and because pressing Send twice on a slow connection is
 * the exact case it exists for.
 *
 * ── WHY `toSpaceId` IS TYPED AND NOT PICKED ────────────────────────────────
 * Paying somebody else is the product — `bank-service.test.ts` pins that a
 * transfer "moves value between two different users spaces" — and this session
 * can only enumerate its OWN spaces. A destination picker limited to your own
 * spaces would quietly delete the feature; a picker over everyone's would be a
 * directory of strangers' accounts. So the destination is an id you were given.
 *
 * Amounts are decimal strings end to end. Nothing on this screen parses one.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankTransfers',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      transfer: { fromSpaceId: '', toSpaceId: '', amount: '' },
      standing: { fromSpaceId: '', toSpaceId: '', amount: '', cadence: 'monthly', startsAt: '', endsAt: '' },
      cancellingId: '',
      actingId: '',
      openScheduleId: '',
      spaces: this.emptySection(),
      schedules: this.emptySection(),
      executions: this.emptySection(),
      created: this.emptyAction(),
      scheduled: this.emptyAction(),
      paused: this.emptyAction(),
      resumed: this.emptyAction(),
      cancelled: this.emptyAction()
    };
  },
  computed: {
    canTransfer() {
      return Boolean(this.transfer.fromSpaceId && this.transfer.toSpaceId && this.transfer.amount && this.draftId('transfer'));
    },
    canSchedule() {
      return Boolean(this.standing.fromSpaceId && this.standing.toSpaceId && this.standing.amount && this.standing.startsAt);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('spaces', query('bank', 'spaces.list', {}, this.ixToken));
    this.reloadSchedules();
  },
  methods: {
    reloadSchedules() {
      this.load('schedules', query('bank', 'transfers.listSchedules', undefined, this.ixToken));
    },
    submitTransfer() {
      var self = this;
      if (!this.canTransfer) return;
      this.act(
        'created',
        mutate(
          'bank',
          'transfers.create',
          {
            transferId: this.draftId('transfer'),
            fromSpaceId: this.transfer.fromSpaceId,
            toSpaceId: this.transfer.toSpaceId,
            amount: this.transfer.amount
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        // The id is released only on acceptance. A refusal keeps it, so the
        // same draft retried is still the same transfer.
        self.clearDraftId('transfer');
        self.transfer = { fromSpaceId: '', toSpaceId: '', amount: '' };
        self.load('spaces', query('bank', 'spaces.list', {}, self.ixToken));
      });
    },
    submitSchedule() {
      var self = this;
      if (!this.canSchedule) return;
      var input = {
        fromSpaceId: this.standing.fromSpaceId,
        toSpaceId: this.standing.toSpaceId,
        amount: this.standing.amount,
        cadence: this.standing.cadence,
        startsAt: this.standing.startsAt
      };
      if (this.standing.endsAt) input.endsAt = this.standing.endsAt;
      this.act('scheduled', mutate('bank', 'transfers.schedule', input, this.ixToken)).then(function(res) {
        if (res.ok) self.reloadSchedules();
      });
    },
    /**
     * Pause and resume are a PAIR and are drawn one at a time, on `status`.
     * Offering both at once would put a button on the screen that the service
     * is guaranteed to refuse, and a refusal the reader could not have avoided
     * teaches them to ignore refusals.
     */
    pauseSchedule(schedule) {
      var self = this;
      this.actingId = schedule.id;
      this.resumed = this.emptyAction();
      this.act('paused', mutate('bank', 'transfers.pause', { scheduleId: schedule.id }, this.ixToken)).then(function(res) {
        self.actingId = '';
        if (res.ok) self.reloadSchedules();
      });
    },
    resumeSchedule(schedule) {
      var self = this;
      this.actingId = schedule.id;
      this.paused = this.emptyAction();
      this.act('resumed', mutate('bank', 'transfers.resume', { scheduleId: schedule.id }, this.ixToken)).then(function(res) {
        self.actingId = '';
        if (res.ok) self.reloadSchedules();
      });
    },
    cancelSchedule(schedule) {
      var self = this;
      this.cancellingId = schedule.id;
      this.act('cancelled', mutate('bank', 'transfers.cancel', { scheduleId: schedule.id }, this.ixToken)).then(function(res) {
        self.cancellingId = '';
        if (res.ok) self.reloadSchedules();
      });
    },
    showExecutions(schedule) {
      this.openScheduleId = schedule.id;
      this.load('executions', query('bank', 'transfers.executions', { scheduleId: schedule.id }, this.ixToken));
    }
  }
};
</script>
