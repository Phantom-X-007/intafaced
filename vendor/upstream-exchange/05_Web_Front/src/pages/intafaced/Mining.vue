<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>Mining share submission</h1>
      <p>Submit observed pool shares to the ledger-backed mining service.</p>
      <details class="bank-details"><summary>Details</summary><code>svc-mining-pool · /api/mining/submitShare</code></details>
    </div>

    <section class="ix-card">
      <div class="ix-card-head">
        <h2>Observed share data</h2>
        <span class="ix-sub">POST</span>
      </div>
      <p class="ix-note ix-note-quiet">All values are required from the submitter. This page does not estimate or calculate pool results.</p>

      <form class="ix-form" @submit.prevent="submit">
        <label>
          Window ID
          <input v-model.trim="form.windowId" type="text" autocomplete="off">
        </label>
        <label>
          Epoch
          <input v-model.trim="form.epoch" type="text" inputmode="numeric" autocomplete="off">
        </label>
        <label>
          Asset ID
          <input v-model.trim="form.assetId" type="text" autocomplete="off">
        </label>
        <label>
          Reward amount
          <input v-model.trim="form.reward" type="text" inputmode="decimal" autocomplete="off">
        </label>
        <label>
          Fee basis points
          <input v-model.trim="form.feeBps" type="text" inputmode="numeric" autocomplete="off">
        </label>
        <label>
          Observed shares (JSON)
          <textarea v-model="form.shares" rows="8" spellcheck="false"></textarea>
        </label>
        <button type="submit" class="ix-submit" :disabled="result.busy">
          {{ result.busy ? 'Submitting…' : 'Submit observed shares' }}
        </button>
      </form>
    </section>

    <section v-if="result.ran" class="ix-card">
      <div class="ix-card-head">
        <h2>Service response</h2>
        <span class="ix-sub">{{ result.status }}</span>
      </div>
      <div v-if="result.code" class="ix-note" :class="{ 'ix-note-success': result.ok }">
        <strong>{{ result.code }}</strong>
        <div v-if="result.message" style="margin-top:6px;">{{ result.message }}</div>
      </div>
      <pre class="ix-response">{{ result.body }}</pre>
    </section>
  </div>
</template>

<script>
const ENDPOINT = '/api/mining/submitShare';

export default {
  name: 'IxMining',
  data() {
    return {
      form: {
        windowId: '',
        epoch: '',
        assetId: '',
        reward: '',
        feeBps: '',
        shares: ''
      },
      result: {
        busy: false,
        ran: false,
        ok: false,
        status: '',
        code: '',
        message: '',
        body: ''
      }
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
  },
  methods: {
    refusal(code, message) {
      this.result = {
        busy: false,
        ran: true,
        ok: false,
        status: 'refused',
        code: code,
        message: message || '',
        body: JSON.stringify({ accepted: false, error: code }, null, 2)
      };
    },
    payload() {
      if (!this.form.epoch) {
        this.refusal('mining.epoch_unset', 'Enter a non-negative integer epoch supplied by the pool.');
        return null;
      }
      if (!/^\d+$/.test(this.form.epoch)) {
        this.refusal('mining.epoch_unset', 'Epoch must be a non-negative integer supplied by the pool.');
        return null;
      }
      if (!this.form.windowId || !this.form.assetId) {
        this.refusal('window_unconfigured', 'Window ID and asset ID are required.');
        return null;
      }
      if (!this.form.reward) {
        this.refusal('reward_unconfigured', 'Enter the service-supplied reward amount.');
        return null;
      }
      if (!/^\d+$/.test(this.form.feeBps) || Number(this.form.feeBps) >= 10000) {
        this.refusal('fee_unconfigured', 'Fee basis points must be a non-negative integer below 10000.');
        return null;
      }

      let shares;
      try {
        shares = JSON.parse(this.form.shares);
      } catch (error) {
        this.refusal('mining.shares_malformed', 'Observed shares must be valid JSON.');
        return null;
      }
      if (!Array.isArray(shares) || shares.length === 0) {
        this.refusal('shares_empty', 'Submit at least one observed share.');
        return null;
      }

      return {
        windowId: this.form.windowId,
        epoch: Number(this.form.epoch),
        assetId: this.form.assetId,
        reward: this.form.reward,
        feeBps: Number(this.form.feeBps),
        shares: shares
      };
    },
    submit() {
      const input = this.payload();
      if (!input) return;

      this.result = { busy: true, ran: true, ok: false, status: 'submitting', code: '', message: '', body: '' };
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input)
      }).then(response => response.text().then(body => ({ response: response, body: body }))).then(({ response, body }) => {
        let parsed = null;
        try {
          parsed = body ? JSON.parse(body) : null;
        } catch (error) {
          parsed = null;
        }
        const code = response.ok ? 'accepted' : (parsed && typeof parsed.error === 'string' ? parsed.error : 'mining.submitShare_failed');
        this.result = {
          busy: false,
          ran: true,
          ok: response.ok,
          status: String(response.status),
          code: code,
          message: response.ok ? '' : (parsed && typeof parsed.error === 'string' ? parsed.error : 'The service refused the submission.'),
          body: body || '(empty response)'
        };
      }, () => {
        this.refusal('mining.edge_unreachable', 'Could not reach the mining edge route.');
      });
    }
  }
};
</script>

<style scoped>
.ix-response {
  white-space: pre-wrap;
  word-break: break-word;
  margin: 14px 0 0;
  padding: 14px;
  background: var(--ix-surface-quiet, #f5f5f5);
  border-radius: 4px;
}
</style>
