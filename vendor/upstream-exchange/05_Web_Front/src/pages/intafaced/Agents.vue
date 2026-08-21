<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.agents.title') }}</h1>
      <p>{{ $t('intafaced.modules.agents.blurb') }}</p>
      <div class="ix-source">svc-agents · /api/agents/trpc</div>
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
      <IxState :loading="routes.loading" :reason="routes.reason" :message="routes.message" endpoint="/api/agents/trpc/routes.list">
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
      <IxState :loading="log.loading" :reason="log.reason" :message="log.message" endpoint="/api/agents/trpc/log.mine">
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
      <IxState v-if="coach.reason || coach.loading" :loading="coach.loading" :reason="coach.reason" :message="coach.message" endpoint="/api/agents/trpc/coach.session">
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
        <h2>{{ $t('intafaced.agents.growth.title') }}</h2>
        <span class="ix-sub">growth.propose</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.agents.growth.lead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-growth-headline">{{ $t('intafaced.agents.growth.headline') }}</label>
          <Input element-id="ix-growth-headline" v-model="growthForm.headline" :placeholder="$t('intafaced.agents.growth.headlineHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-growth-copy">{{ $t('intafaced.agents.growth.copy') }}</label>
          <Input element-id="ix-growth-copy" v-model="growthForm.copy" :placeholder="$t('intafaced.agents.growth.copyHint')"></Input>
        </div>
      </div>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button type="primary" :loading="growth.loading" @click="proposeGrowth">{{ $t('intafaced.agents.growth.run') }}</Button>
      </div>
      <IxState v-if="growth.reason || growth.loading" :loading="growth.loading" :reason="growth.reason" :message="growth.message" endpoint="/api/agents/trpc/growth.propose">
        <div v-if="growth.data && growth.data.status === 'refuse'" class="ix-note">
          {{ $t('intafaced.agents.growth.refused') }} · {{ growth.data.reason }}
        </div>
        <div v-else-if="growth.data && growth.data.status === 'proposal'" class="ix-done">
          <strong>{{ $t('intafaced.agents.growth.proposal') }}</strong>
          <div style="margin-top:6px;">{{ growth.data.headline }}</div>
        </div>
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
      <IxState v-if="risk.reason || risk.loading" :loading="risk.loading" :reason="risk.reason" :message="risk.message" endpoint="/api/agents/trpc/riskCompliance.draftScreening">
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
 * offered here. Coach, growth, and screening drafts are queries — named refuse
 * or a draft. Never publish, never a KYC decision, never list contents.
 *
 * No model vendor is named anywhere here. The routing table speaks in tasks and
 * aliases, and the concrete upstream id never leaves the adapter.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
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
      growth: { loading: false, reason: null, message: '', data: null },
      risk: { loading: false, reason: null, message: '', data: null },
      ask: '',
      growthForm: { headline: '', copy: '' },
      riskForm: { subjectId: '', region: '' }
    };
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
      this.load(
        'growth',
        query('agents', 'growth.propose', { headline: this.growthForm.headline, copy: this.growthForm.copy }, this.ixToken)
      );
    },
    draftScreening() {
      var input = {};
      if (this.riskForm.subjectId) input.subjectId = this.riskForm.subjectId;
      if (this.riskForm.region) input.region = this.riskForm.region;
      this.load('risk', query('agents', 'riskCompliance.draftScreening', input, this.ixToken));
    }
  }
};
</script>
