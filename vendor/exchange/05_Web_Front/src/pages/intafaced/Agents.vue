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
 * There is no "run an agent" control on this screen, and that is deliberate:
 * `session.open` and `run.complete` want `agents:execute`, which svc-identity
 * issues to nobody. A button that could only ever produce a 403 is worse than
 * no button, because it implies the feature is one click away.
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
      log: this.emptySection()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('routes', query('agents', 'routes.list', undefined, this.ixToken));
    this.load('log', query('agents', 'log.mine', { limit: 50 }, this.ixToken));
  }
};
</script>
