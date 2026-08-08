<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.linksPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.linksPage.lead') }}</p>
      <div class="ix-source">svc-pay · merchant.me · merchant.listLinks · merchant.createLink · merchant.deactivateLink</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
      <div v-if="!merchantId" class="ix-note ix-note-quiet">
        {{ $t('intafaced.pay.linksPage.needMerchant') }}
        <div class="ix-actions" style="margin-top:12px;">
          <router-link to="/pay/merchant">
            <Button size="small">{{ $t('intafaced.pay.overview.openMerchant') }}</Button>
          </router-link>
        </div>
      </div>

      <template v-else>
        <!-- ── a new link ─────────────────────────────────────────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.newLink') }}</h2>
            <span class="ix-sub">merchant.createLink</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.linksPage.createLead') }}</p>

          <div class="ix-field-grid">
            <div class="ix-field">
              <label for="ix-link-label">{{ $t('intafaced.pay.linkLabel') }}</label>
              <Input element-id="ix-link-label" v-model="form.label" :placeholder="$t('intafaced.pay.linkLabelHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-link-amount">{{ $t('intafaced.pay.fixedAmountOptional') }}</label>
              <Input element-id="ix-link-amount" v-model="form.amount" :placeholder="$t('intafaced.bank.amountHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-link-currency">{{ $t('intafaced.pay.currencyOptional') }}</label>
              <Input element-id="ix-link-currency" v-model="form.currency" :placeholder="$t('intafaced.bank.assetHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-link-expiry">{{ $t('intafaced.pay.expiresAtOptional') }}</label>
              <Input element-id="ix-link-expiry" v-model="form.expiresAt" :placeholder="$t('intafaced.bank.isoHint')"></Input>
            </div>
            <div class="ix-field">
              <label for="ix-link-uses">{{ $t('intafaced.pay.maxUsesOptional') }}</label>
              <Input element-id="ix-link-uses" v-model="form.maxUses" :placeholder="$t('intafaced.pay.maxUsesHint')"></Input>
            </div>
          </div>

          <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
            {{ $t('intafaced.pay.linksPage.expiryNote') }}
          </div>

          <div class="ix-actions">
            <Button type="primary" :loading="minted.busy" :disabled="!form.label" @click="submitLink">
              {{ $t('intafaced.pay.createLink') }}
            </Button>
          </div>

          <div v-if="minted.ran" style="margin-top:14px;">
            <div v-if="minted.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.linkCreated') }}</strong>
              <!-- The token comes back ONCE. It is a capability: whoever holds
                   it can open a checkout against this merchant, and svc-pay
                   never returns it again. Saying so beside it is the difference
                   between a reader copying it and a reader losing it. -->
              <div style="margin-top:10px;">{{ $t('intafaced.pay.tokenOnce') }}</div>
              <div style="margin-top:8px;"><code>{{ minted.data.token }}</code></div>
              <div style="margin-top:8px;">
                {{ $t('intafaced.pay.expiresAt') }}: {{ minted.data.expiresAt }}
              </div>
            </div>
            <IxState v-else :loading="minted.busy" :reason="minted.reason" :message="minted.message" endpoint="/api/pay/trpc/merchant.createLink"></IxState>
          </div>
        </div>

        <!-- ── the links that exist ───────────────────────────────────── -->
        <div class="ix-card">
          <div class="ix-card-head">
            <h2>{{ $t('intafaced.pay.myLinks') }}</h2>
            <span class="ix-sub">merchant.listLinks</span>
          </div>
          <p class="ix-lead">{{ $t('intafaced.pay.linksPage.listLead') }}</p>
          <IxState :loading="links.loading" :reason="links.reason" :message="links.message" endpoint="/api/pay/trpc/merchant.listLinks">
            <div v-if="links.data && links.data.length" class="ix-scroll">
              <table class="ix-table">
                <thead>
                  <tr>
                    <th>{{ $t('intafaced.pay.linkLabel') }}</th>
                    <th>{{ $t('intafaced.pay.prefix') }}</th>
                    <th>{{ $t('intafaced.pay.amount') }}</th>
                    <th>{{ $t('intafaced.pay.currency') }}</th>
                    <th>{{ $t('intafaced.pay.uses') }}</th>
                    <th>{{ $t('intafaced.pay.expiresAt') }}</th>
                    <th>{{ $t('intafaced.pay.active') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="l in links.data" :key="l.id">
                    <td>{{ l.label }}</td>
                    <td><code>{{ l.prefix }}</code></td>
                    <td>{{ l.amount === null ? $t('intafaced.pay.payerChooses') : l.amount }}</td>
                    <td>{{ l.currency === null ? '—' : l.currency }}</td>
                    <td>{{ l.uses }}{{ l.maxUses === null ? '' : ' / ' + l.maxUses }}</td>
                    <td>{{ l.expiresAt === null ? '—' : l.expiresAt }}</td>
                    <td>{{ l.active ? $t('intafaced.bank.yes') : $t('intafaced.bank.no') }}</td>
                    <td>
                      <Button
                        v-if="l.active"
                        size="small"
                        :loading="killed.busy && killingId === l.id"
                        @click="deactivate(l)"
                      >{{ $t('intafaced.pay.deactivate') }}</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.noLinks') }}</div>
          </IxState>

          <div v-if="killed.ran" style="margin-top:14px;">
            <div v-if="killed.reason === 'ok'" class="ix-done">
              <strong>{{ $t('intafaced.pay.linkDeactivated') }}</strong>
            </div>
            <IxState v-else :loading="killed.busy" :reason="killed.reason" :message="killed.message" endpoint="/api/pay/trpc/merchant.deactivateLink"></IxState>
          </div>
        </div>
      </template>
    </IxState>
  </div>
</template>

<script>
/**
 * PAYMENT LINKS — svc-pay's hosted-checkout pointers.
 *
 * ── THE TOKEN IS SHOWN ONCE, AND THE SCREEN SAYS SO ───────────────────────
 * `createLink` returns `token` exactly once; `listLinks` returns only `prefix`.
 * That is not an oversight in the service, it is the design — a link token is a
 * capability URL and storing it twice is storing it twice. This screen prints
 * the token in the acceptance panel with the warning attached, and the table
 * below shows the prefix, which is what a merchant needs in order to recognise
 * a link they already have.
 *
 * ── NO URL IS ASSEMBLED HERE ──────────────────────────────────────────────
 * It would be easy to print `https://…/checkout?token=…` and it would be a
 * guess: the hosted-checkout origin is a deployment fact this shell does not
 * hold, and a wrong one printed beside a real token is worse than no URL. The
 * token is the thing svc-pay issued, so the token is what is shown.
 *
 * ── THE EXPIRY FIELD IS OPTIONAL AND THE OMISSION MEANS THE DEFAULT ───────
 * The router passes `undefined` rather than `null` when it is omitted,
 * precisely because the service reads `null` as "never expires" and refuses it.
 * A blank box here therefore means "the service's default", which the note says
 * out loud rather than leaving the reader to assume "forever".
 *
 * `amount` is a decimal string on the wire and stays one; nothing on this
 * screen parses it.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPayLinks',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      form: { label: '', amount: '', currency: '', expiresAt: '', maxUses: '' },
      killingId: '',
      merchant: this.emptySection(),
      links: this.emptySection(),
      minted: this.emptyAction(),
      killed: this.emptyAction()
    };
  },
  computed: {
    merchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    var self = this;
    this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken)).then(function(res) {
      if (res.ok && res.data) self.reloadLinks();
    });
  },
  methods: {
    reloadLinks() {
      if (!this.merchantId) return;
      this.load('links', query('pay', 'merchant.listLinks', { merchantId: this.merchantId }, this.ixToken));
    },
    submitLink() {
      var self = this;
      if (!this.merchantId || !this.form.label) return;
      var input = { merchantId: this.merchantId, label: this.form.label };
      // Blank optionals are OMITTED, never sent as ''. `amount` is an unsigned
      // decimal string and `currency` an asset id; '' fails both schemas, which
      // would surface as a validation error about a field left deliberately
      // alone. `expiresAt` omitted means the service default — see the header.
      if (this.form.amount) input.amount = this.form.amount;
      if (this.form.currency) input.currency = this.form.currency;
      if (this.form.expiresAt) input.expiresAt = this.form.expiresAt;
      if (/^\d+$/.test(this.form.maxUses)) input.maxUses = parseInt(this.form.maxUses, 10);

      this.act('minted', mutate('pay', 'merchant.createLink', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.form = { label: '', amount: '', currency: '', expiresAt: '', maxUses: '' };
        self.reloadLinks();
      });
    },
    deactivate(link) {
      var self = this;
      this.killingId = link.id;
      this.act(
        'killed',
        mutate('pay', 'merchant.deactivateLink', { merchantId: this.merchantId, linkId: link.id }, this.ixToken)
      ).then(function(res) {
        self.killingId = '';
        if (res.ok) self.reloadLinks();
      });
    }
  }
};
</script>
