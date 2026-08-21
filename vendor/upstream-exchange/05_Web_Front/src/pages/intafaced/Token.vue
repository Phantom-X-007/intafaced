<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.token.title') }}</h1>
      <p>{{ $t('intafaced.modules.token.blurb') }}</p>
      <div class="ix-source">svc-token · /api/token/trpc</div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.modules.token.title') }}</h2>
        <span class="ix-sub">accessOf</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.token.lead') }}
      </p>

      <IxState :loading="access.loading" :reason="access.reason" :message="access.message" endpoint="/api/token/trpc/accessOf">
        <div v-if="access.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.staked') }}</span>
            <span class="v">{{ access.data.staked }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.tier') }}</span>
            <span class="v">{{ access.data.tier }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.feeDiscount') }}</span>
            <span class="v">{{ access.data.feeDiscountBps }} {{ $t('intafaced.token.bps') }}</span>
          </div>
        </div>
      </IxState>

      <div v-if="tierLooksBroken" class="ix-note" style="margin-top:16px;">
        <strong>{{ $t('intafaced.token.tier') }}</strong>
        <div style="margin-top:6px;">{{ $t('intafaced.token.tierBug') }}</div>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.token.staked') }}</h2>
        <span class="ix-sub">stakeOf</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.token.stakeOfLead') }}
      </p>
      <IxState :loading="stake.loading" :reason="stake.reason" :message="stake.message" endpoint="/api/token/trpc/stakeOf">
        <div v-if="stake.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.token.staked') }}</span>
            <span class="v">{{ stake.data.staked }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.token.stakeNow') }}</h2>
        <span class="ix-sub">stake</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.token.stakeLead') }}
      </p>
      <div class="ix-form-row">
        <div class="ix-field">
          <label for="ix-token-amount">{{ $t('intafaced.token.amount') }}</label>
          <Input element-id="ix-token-amount" v-model="amount" :placeholder="$t('intafaced.token.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label>{{ $t('intafaced.token.tierChoice') }}</label>
          <Select v-model="tier" :placeholder="$t('intafaced.token.chooseTier')">
            <Option value="flex" :label="$t('intafaced.token.tierFlex')"></Option>
            <Option value="m3" :label="$t('intafaced.token.tierM3')"></Option>
            <Option value="m12" :label="$t('intafaced.token.tierM12')"></Option>
          </Select>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :loading="staked.busy" :disabled="!canStake" @click="submitStake">
            {{ $t('intafaced.token.stakeNow') }}
          </Button>
        </div>
      </div>
      <div v-if="staked.ran" style="margin-top:14px;">
        <div v-if="staked.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.token.stakeAccepted') }}</strong>
          <div style="margin-top:6px;">{{ staked.data.amount }} · {{ staked.data.tier }} · {{ staked.data.status }}</div>
        </div>
        <IxState v-else :loading="staked.busy" :reason="staked.reason" :message="staked.message" endpoint="/api/token/trpc/stake"></IxState>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.token.stakes') }}</h2>
        <span class="ix-sub">listStakes · unstake</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.token.stakesLead') }}
      </p>
      <IxState :loading="stakes.loading" :reason="stakes.reason" :message="stakes.message" endpoint="/api/token/trpc/listStakes">
        <div v-if="stakes.data && stakes.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.token.amount') }}</th>
                <th>{{ $t('intafaced.token.tierChoice') }}</th>
                <th>{{ $t('intafaced.token.status') }}</th>
                <th>{{ $t('intafaced.token.unlocksAt') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in stakes.data" :key="row.id">
                <td>{{ row.amount }}</td>
                <td>{{ row.tier }}</td>
                <td>{{ row.status }}</td>
                <td>{{ row.unlocksAt === null ? '—' : row.unlocksAt }}</td>
                <td>
                  <Button
                    size="small"
                    :loading="unstaked.busy && unstakingId === row.id"
                    :disabled="row.status !== 'active'"
                    @click="submitUnstake(row)"
                  >{{ $t('intafaced.token.unstake') }}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.token.noStakes') }}</div>
      </IxState>
      <div v-if="unstaked.ran" style="margin-top:14px;">
        <div v-if="unstaked.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.token.unstakeAccepted') }}</strong>
          <div style="margin-top:6px;">{{ unstaked.data.amount }} · {{ unstaked.data.status }}</div>
        </div>
        <IxState v-else :loading="unstaked.busy" :reason="unstaked.reason" :message="unstaked.message" endpoint="/api/token/trpc/unstake"></IxState>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * svc-token (§4.3).
 *
 * `stakeOf` and `accessOf` bind to the signed principal on the router — no
 * userId is sent from the browser. A missing session is an IxState refusal,
 * not a local "0". A returned `staked` of "0" is a real figure and is drawn.
 *
 * `listStakes` answering [] is empty, not zero. `stake` / `unstake` are the
 * live user mutates already on main. mintEpoch and admin treasury are not
 * drawn — those are operator doors, not this screen.
 *
 * NOTE ON `tier`. If the service still answers `"[object Object]"` it is shown
 * exactly as received. Formatting it here would hide a service bug.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxToken',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      amount: '',
      tier: 'flex',
      unstakingId: '',
      access: this.emptySection(),
      stake: this.emptySection(),
      stakes: this.emptySection(),
      staked: this.emptyAction(),
      unstaked: this.emptyAction()
    };
  },
  computed: {
    tierLooksBroken() {
      return !!(this.access.data && this.access.data.tier === '[object Object]');
    },
    canStake() {
      return Boolean(this.amount && this.tier);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.reload();
  },
  methods: {
    reload() {
      this.load('access', query('token', 'accessOf', undefined, this.ixToken));
      this.load('stake', query('token', 'stakeOf', undefined, this.ixToken));
      this.load('stakes', query('token', 'listStakes', { status: 'active' }, this.ixToken));
    },
    submitStake() {
      var self = this;
      if (!this.canStake) return;
      var stakeId = this.draftId('tokenStake');
      var input = { amount: this.amount, tier: this.tier };
      if (stakeId) input.stakeId = stakeId;
      this.act('staked', mutate('token', 'stake', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.amount = '';
        self.clearDraftId('tokenStake');
        self.reload();
      });
    },
    submitUnstake(row) {
      var self = this;
      this.unstakingId = row.id;
      this.act('unstaked', mutate('token', 'unstake', { stakeId: row.id }, this.ixToken)).then(function(res) {
        self.unstakingId = '';
        if (res.ok) self.reload();
      });
    }
  }
};
</script>
