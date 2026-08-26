<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.agents.title') }}</h1>
      <p>{{ $t('intafaced.modules.agents.blurb') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-agents · /api/agents/trpc</code></details>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.agents.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.agents.routes') }}</h2>
        <span class="ix-sub">routes.list</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.agents.routesLead') }}
      </p>
      <IxState compact :loading="routes.loading" :reason="routes.reason" :message="routes.message" endpoint="/api/agents/trpc/routes.list">
        <div v-if="routes.data && routes.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.agents.task') }}</th>
                <th>{{ $t('intafaced.agents.capability') }}</th>
                <th>{{ $t('intafaced.agents.maxOutput') }}</th>
                <th>{{ $t('intafaced.agents.inputPrice') }}</th>
                <th>{{ $t('intafaced.agents.outputPrice') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in routes.data" :key="r.task">
                <td>{{ r.task }}</td>
                <td>{{ r.capability }}</td>
                <td>{{ r.maxOutputTokens }}</td>
                <td>{{ r.inputPerMillion }} {{ r.assetId }}</td>
                <td>{{ r.outputPerMillion }} {{ r.assetId }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.agents.log') }}</h2>
        <span class="ix-sub">log.mine</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.agents.logLead') }}
      </p>
      <IxState compact :loading="log.loading" :reason="log.reason" :message="log.message" endpoint="/api/agents/trpc/log.mine">
        <div v-if="log.data && log.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.pay.created') }}</th>
                <th>{{ $t('intafaced.agents.task') }}</th>
                <th>{{ $t('intafaced.bank.status') }}</th>
                <th>{{ $t('intafaced.pay.amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in log.data" :key="a.id">
                <td>{{ a.occurredAt }}</td>
                <td>{{ a.task || a.kind }}</td>
                <td>{{ a.status }}</td>
                <td>{{ a.cost }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.agents.noActions') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.agents.coach.title') }}</h2>
        <span class="ix-sub">coach.session</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.agents.coach.lead') }}</p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-coach-ask">{{ $t('intafaced.agents.coach.ask') }}</label>
          <Input element-id="ix-coach-ask" v-model="ask" :placeholder="$t('intafaced.agents.coach.askHint')" @on-enter="askCoach"></Input>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :loading="coach.loading" @click="askCoach">{{ $t('intafaced.agents.coach.run') }}</Button>
        </div>
      </div>
      <IxState compact v-if="coach.reason || coach.loading" :loading="coach.loading" :reason="coach.reason" :message="coach.message" endpoint="/api/agents/trpc/coach.session">
        <div v-if="coach.data && coach.data.status === 'refuse'" class="ix-note">
          {{ $t('intafaced.agents.coach.refused') }} · {{ coach.data.reason }}
        </div>
        <div v-else-if="coach.data && coach.data.status === 'grounded'">
          <div class="ix-note ix-note-quiet" style="margin-bottom:12px;">{{ $t('intafaced.agents.coach.grounded') }}</div>
          <div v-if="coach.data.citations && coach.data.citations.length" class="ix-scroll">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.agents.coach.slug') }}</th>
                  <th>{{ $t('intafaced.agents.coach.citationTitle') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in coach.data.citations" :key="c.slug">
                  <td>{{ c.slug }}</td>
                  <td>{{ c.title }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.marketing.title') }}</h2>
        <span class="ix-sub">growth.propose</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.marketing.lead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-growth-headline">{{ $t('intafaced.marketing.headline') }}</label>
          <Input element-id="ix-growth-headline" v-model="growthForm.headline" :placeholder="$t('intafaced.marketing.headlineHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-growth-copy">{{ $t('intafaced.marketing.copy') }}</label>
          <Input element-id="ix-growth-copy" v-model="growthForm.copy" :placeholder="$t('intafaced.marketing.copyHint')"></Input>
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button type="primary" :loading="growth.busy" @click="proposeGrowth">{{ $t('intafaced.marketing.run') }}</Button>
      </div>
      <IxState compact v-if="growth.ran" :loading="growth.busy" :reason="growth.reason" :message="growth.message" endpoint="/api/agents/trpc/growth.propose">
        <div v-if="growth.data && growth.data.status === 'refuse'" class="ix-note">
          {{ $t('intafaced.marketing.refused') }} · {{ growth.data.reason }}
        </div>
        <div v-else-if="growth.data && growth.data.status === 'proposal'" class="ix-done">
          <strong>{{ $t('intafaced.marketing.proposal') }}</strong>
          <div style="margin-top:6px;">{{ growth.data.headline }}</div>
        </div>
      </IxState>
      <p class="ix-note ix-note-quiet">{{ $t('intafaced.marketing.attribution') }}</p>
      <p class="ix-lead">{{ $t('intafaced.marketing.outboundLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-growth-channel">{{ $t('intafaced.marketing.outbound') }}</label>
          <select id="ix-growth-channel" v-model="outboundChannel">
            <option value="email">email</option>
            <option value="push">push</option>
            <option value="sms">sms</option>
          </select>
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button type="primary" :loading="outbound.loading" @click="checkOutbound">{{ $t('intafaced.marketing.outboundRun') }}</Button>
      </div>
      <IxState compact v-if="outbound.reason || outbound.loading" :loading="outbound.loading" :reason="outbound.reason" :message="outbound.message" endpoint="/api/notify/trpc/notify.channels">
        <div v-if="outboundUnset" class="ix-note">
          {{ $t('intafaced.marketing.outboundRefused') }} · <code>{{ outboundUnset.reason || 'channel.not_configured' }}</code>
        </div>
        <div v-else-if="outboundRows.length" class="ix-kv">
          <div v-for="row in outboundRows" :key="row.channel" class="ix-kv-item">
            <span class="k">{{ row.channel }}</span>
            <span class="v"><code>{{ row.available ? row.channel : (row.reason || 'channel.not_configured') }}</code></span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.agents.risk.title') }}</h2>
        <span class="ix-sub">riskCompliance.draftScreening</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.agents.risk.lead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-risk-subject">{{ $t('intafaced.agents.risk.subjectId') }}</label>
          <Input element-id="ix-risk-subject" v-model="riskForm.subjectId" :placeholder="$t('intafaced.agents.risk.subjectHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-risk-region">{{ $t('intafaced.agents.risk.region') }}</label>
          <Input element-id="ix-risk-region" v-model="riskForm.region" :placeholder="$t('intafaced.agents.risk.regionHint')"></Input>
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button type="primary" :loading="risk.loading" @click="draftScreening">{{ $t('intafaced.agents.risk.run') }}</Button>
      </div>
      <IxState compact v-if="risk.reason || risk.loading" :loading="risk.loading" :reason="risk.reason" :message="risk.message" endpoint="/api/agents/trpc/riskCompliance.draftScreening">
        <div v-if="risk.data && risk.data.status === 'refuse'" class="ix-note">
          {{ $t('intafaced.agents.risk.refused') }} · {{ risk.data.reason }}
        </div>
        <div v-else-if="risk.data && risk.data.status === 'draft'" class="ix-done">
          <strong>{{ $t('intafaced.agents.risk.draft') }}</strong>
          <div class="ix-kv" style="margin-top:8px;">
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.agents.risk.listHits') }}</span><span class="v">{{ risk.data.listHitCount }}</span></div>
            <div class="ix-kv-item"><span class="k">{{ $t('intafaced.agents.risk.businessHits') }}</span><span class="v">{{ risk.data.businessHitCount }}</span></div>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.agents.copy.title') }}</h2>
        <span class="ix-sub">copyIntel.runSession</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.agents.copy.lead') }}
      </p>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-copy-plane">{{ $t('intafaced.agents.copy.plane') }}</label>
          <select id="ix-copy-plane" v-model="copyPlane">
            <option value="dark">{{ $t('intafaced.agents.copy.planeDark') }}</option>
            <option value="live">{{ $t('intafaced.agents.copy.planeLive') }}</option>
          </select>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :loading="copy.busy" @click="runCopy">{{ $t('intafaced.agents.copy.run') }}</Button>
        </div>
      </div>
      <IxState compact v-if="copy.ran" :loading="copy.busy" :reason="copy.reason" :message="copy.message" endpoint="/api/agents/trpc/copyIntel.runSession">
        <div v-if="copy.data && copy.data.status === 'refuse'" class="ix-note">
          {{ $t('intafaced.agents.copy.refused') }} · {{ copy.data.reason }}
          <div v-if="copy.data.metering" style="margin-top:6px;">{{ $t('intafaced.agents.copy.billed') }} {{ copy.data.metering.billedAmount }}</div>
        </div>
        <div v-else-if="copy.data && copy.data.status === 'unavailable'" class="ix-note">
          {{ $t('intafaced.agents.copy.unavailable') }} · {{ copy.data.reason }}
          <div v-if="copy.data.metering" style="margin-top:6px;">{{ $t('intafaced.agents.copy.billed') }} {{ copy.data.metering.billedAmount }}</div>
        </div>
        <div v-else-if="copy.data && copy.data.status === 'empty'" class="ix-note ix-note-quiet">
          {{ $t('intafaced.agents.copy.empty') }}
        </div>
        <div v-else-if="copy.data && copy.data.status === 'ok' && copy.data.presentation && copy.data.presentation.rankedByReturns" class="ix-note">
          {{ $t('intafaced.agents.copy.refused') }}
        </div>
        <div v-else-if="copy.data && copy.data.status === 'ok'">
          <div class="ix-note ix-note-quiet" style="margin-bottom:12px;">{{ $t('intafaced.agents.copy.directory') }}</div>
          <div v-if="copyDirectory.length" class="ix-scroll">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.agents.copy.leaderId') }}</th>
                  <th>{{ $t('intafaced.agents.copy.realisedPnl') }}</th>
                  <th>{{ $t('intafaced.agents.copy.closedTrades') }}</th>
                  <th>{{ $t('intafaced.agents.copy.winRate') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in copyDirectory" :key="row.leaderId">
                  <td>{{ row.leaderId }}</td>
                  <td>{{ row.realisedPnl }}</td>
                  <td>{{ row.closedTrades }}</td>
                  <td>{{ row.winRate }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.agents.copy.empty') }}</div>
          <div v-if="copy.data.metering" style="margin-top:8px;color:var(--ix-text-dim);font-size:13px;">
            {{ $t('intafaced.agents.copy.billed') }} {{ copy.data.metering.billedAmount }}
          </div>
        </div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-agents (§8.2) — the reference mount, and the module with the most that
 * actually answers.
 *
 * `routes.list` returns the live routing table with its real per-million
 * prices as decimal strings, and `log.mine` returns this account's own action
 * log. Both sit behind `agents:read`, which an interactive session holds.
 *
 * Fleet runSession still wants agents:execute (issued to nobody) and is not
 * offered here. Coach and screening drafts are queries. Campaign draft is a
 * mutate of already-mounted `growth.propose` — named refuse or a draft. Never
 * publish, never a KYC decision, never list contents.
 *
 * Campaign outbound is a click on notify.channels — email / push / SMS paint
 * `channel.not_configured` when the owner has not set gateway credentials.
 * Not a second send pipeline. Attribution stays the affiliate tree. No
 * performance figures.
 *
 * Copy intel is a user-click mutate of already-on-main `copyIntel.runSession`.
 * Dark plane is the default and refuses `copy_plane_dark` unbilled. Live with
 * no sealed leaders refuses `no_live_leaders`. Empty fixtures stay empty.
 * Ok presentation is a leaderId directory — never a returns-ranked board.
 * Fixtures are sent empty: this screen does not invent live leaders.
 *
 * No model vendor is named anywhere here. The routing table speaks in tasks and
 * aliases, and the concrete upstream id never leaves the adapter.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxAgents',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      routes: this.emptySection(),
      log: this.emptySection(),
      coach: { loading: false, reason: null, message: '', data: null },
      growth: this.emptyAction(),
      outbound: { loading: false, reason: null, message: '', data: null },
      outboundChannel: 'email',
      risk: { loading: false, reason: null, message: '', data: null },
      ask: '',
      growthForm: { headline: '', copy: '' },
      riskForm: { subjectId: '', region: '' },
      copy: this.emptyAction(),
      copyPlane: 'dark'
    };
  },
  computed: {
    outboundRows() {
      var data = this.outbound.data;
      var rows = Array.isArray(data) ? data : [];
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        var ch = rows[i] && rows[i].channel;
        if (ch === 'email' || ch === 'push' || ch === 'sms') out.push(rows[i]);
      }
      return out;
    },
    outboundUnset() {
      var want = this.outboundChannel;
      var rows = this.outboundRows;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].channel === want && rows[i].available !== true) {
          return rows[i];
        }
      }
      return null;
    },
    copyDirectory() {
      var data = this.copy.data;
      if (!data || data.status !== 'ok' || !data.stats || (data.presentation && data.presentation.rankedByReturns)) {
        return [];
      }
      return data.stats.slice().sort(function(a, b) {
        if (a.leaderId < b.leaderId) return -1;
        if (a.leaderId > b.leaderId) return 1;
        return 0;
      });
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('routes', query('agents', 'routes.list', undefined, this.ixToken));
    this.load('log', query('agents', 'log.mine', { limit: 50 }, this.ixToken));
  },
  methods: {
    askCoach() {
      this.load('coach', query('agents', 'coach.session', { ask: this.ask }, this.ixToken));
    },
    proposeGrowth() {
      this.act(
        'growth',
        mutate('agents', 'growth.propose', { headline: this.growthForm.headline, copy: this.growthForm.copy }, this.ixToken)
      );
    },
    checkOutbound() {
      this.load('outbound', query('notify', 'notify.channels', undefined, this.ixToken));
    },
    draftScreening() {
      var input = {};
      if (this.riskForm.subjectId) input.subjectId = this.riskForm.subjectId;
      if (this.riskForm.region) input.region = this.riskForm.region;
      this.load('risk', query('agents', 'riskCompliance.draftScreening', input, this.ixToken));
    },
    runCopy() {
      this.act(
        'copy',
        mutate('agents', 'copyIntel.runSession', { plane: this.copyPlane, fixtures: [] }, this.ixToken)
      );
    }
  }
};
</script>
