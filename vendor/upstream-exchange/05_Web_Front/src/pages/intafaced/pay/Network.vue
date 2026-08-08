<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.networkPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.networkPage.lead') }}</p>
      <div class="ix-source">svc-pay · merchant.me · submerchant.get · submerchant.list · submerchant.create</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <!-- ── the tree, walked one node at a time ──────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.networkPage.treeTitle') }}</h2>
        <span class="ix-sub">submerchant.list</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.networkPage.treeLead') }}</p>

      <IxState :loading="merchant.loading" :reason="merchant.reason" :message="merchant.message" endpoint="/api/pay/trpc/merchant.me">
        <div v-if="!merchantId" class="ix-note ix-note-quiet">
          {{ $t('intafaced.pay.networkPage.needMerchant') }}
          <div class="ix-actions" style="margin-top:12px;">
            <router-link to="/pay/merchant">
              <Button size="small">{{ $t('intafaced.pay.overview.openMerchant') }}</Button>
            </router-link>
          </div>
        </div>

        <template v-else>
          <IxState :loading="root.loading" :reason="root.reason" :message="root.message" endpoint="/api/pay/trpc/submerchant.get">
            <div v-if="rows.length" class="ix-scroll">
              <table class="ix-table">
                <thead>
                  <tr>
                    <th>{{ $t('intafaced.pay.networkPage.node') }}</th>
                    <th>{{ $t('intafaced.pay.networkPage.account') }}</th>
                    <th>{{ $t('intafaced.pay.merchantMode') }}</th>
                    <th>{{ $t('intafaced.bank.status') }}</th>
                    <th>{{ $t('intafaced.pay.kybStatus') }}</th>
                    <th>{{ $t('intafaced.pay.feeBps') }}</th>
                    <th>{{ $t('intafaced.pay.networkPage.settlingParty') }}</th>
                    <th>{{ $t('intafaced.pay.networkPage.depth') }}</th>
                    <th>{{ $t('intafaced.pay.created') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="row in rows">
                    <tr :key="row.id">
                      <td :style="{ paddingLeft: (8 + row.level * 22) + 'px' }">
                        <Button
                          size="small"
                          :loading="row.state.loading"
                          @click="toggle(row)"
                        >{{ row.expanded ? $t('intafaced.pay.networkPage.collapse') : $t('intafaced.pay.networkPage.expand') }}</Button>
                        <span v-if="row.level === 0" class="ix-tag ix-tag-on" style="margin-left:8px;">{{ $t('intafaced.pay.networkPage.youAreHere') }}</span>
                      </td>
                      <td style="font-size:13px;">{{ row.record.userId }}</td>
                      <td>{{ row.record.mode }}</td>
                      <td>{{ row.record.status }}</td>
                      <td>{{ row.record.kybStatus }}</td>
                      <td>
                        <template v-if="row.record.feeBps === null">{{ $t('intafaced.pay.networkPage.noFee') }}</template>
                        <template v-else>{{ row.record.feeBps }} {{ $t('intafaced.token.bps') }}</template>
                      </td>
                      <td>{{ row.record.settlingParty }}</td>
                      <td>{{ row.record.depth }}</td>
                      <td>{{ row.record.createdAt }}</td>
                      <td>
                        <Button size="small" @click="useAsParent(row)">{{ $t('intafaced.pay.networkPage.onboardUnder') }}</Button>
                        <router-link :to="{ path: '/pay/permissions', query: { subject: row.id } }">
                          <Button size="small" style="margin-left:6px;">{{ $t('intafaced.pay.nav.permissions') }}</Button>
                        </router-link>
                      </td>
                    </tr>
                    <tr v-if="row.state.reason && row.state.reason !== 'ok'" :key="row.id + ':state'">
                      <td colspan="10">
                        <IxState
                          :reason="row.state.reason"
                          :message="row.state.message"
                          endpoint="/api/pay/trpc/submerchant.list"
                        ></IxState>
                      </td>
                    </tr>
                    <tr v-else-if="row.expanded && row.childCount === 0" :key="row.id + ':empty'">
                      <td colspan="10">
                        <div class="ix-note ix-note-quiet" style="margin:0;">{{ $t('intafaced.pay.networkPage.noChildren') }}</div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </IxState>
        </template>
      </IxState>
    </div>

    <!-- ── one node, by id ──────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.networkPage.openTitle') }}</h2>
        <span class="ix-sub">submerchant.get</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.networkPage.openLead') }}</p>

      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-sm-open">{{ $t('intafaced.pay.merchantId') }}</label>
          <Input element-id="ix-sm-open" v-model="openId" :placeholder="$t('intafaced.pay.networkPage.merchantIdHint')" @on-enter="openNode"></Input>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :disabled="!openId" @click="openNode">{{ $t('intafaced.pay.networkPage.openButton') }}</Button>
        </div>
      </div>

      <div v-if="openedRan">
        <IxState :loading="opened.loading" :reason="opened.reason" :message="opened.message" endpoint="/api/pay/trpc/submerchant.get">
          <div v-if="opened.data" class="ix-kv">
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.merchantId') }}</span>
              <span class="v" style="font-size:13px;">{{ opened.data.id }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.networkPage.account') }}</span>
              <span class="v" style="font-size:13px;">{{ opened.data.userId }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.networkPage.parent') }}</span>
              <span class="v" style="font-size:13px;">{{ opened.data.parentMerchantId === null ? $t('intafaced.pay.networkPage.noParent') : opened.data.parentMerchantId }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.merchantMode') }}</span>
              <span class="v">{{ opened.data.mode }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.bank.status') }}</span>
              <span class="v">{{ opened.data.status }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.kybStatus') }}</span>
              <span class="v">{{ opened.data.kybStatus }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.feeBps') }}</span>
              <span class="v">
                <template v-if="opened.data.feeBps === null">{{ $t('intafaced.pay.networkPage.noFee') }}</template>
                <template v-else>{{ opened.data.feeBps }} {{ $t('intafaced.token.bps') }}</template>
              </span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.networkPage.settlingParty') }}</span>
              <span class="v">{{ opened.data.settlingParty }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.networkPage.depth') }}</span>
              <span class="v">{{ opened.data.depth }}</span>
            </div>
            <div class="ix-kv-item">
              <span class="k">{{ $t('intafaced.pay.created') }}</span>
              <span class="v">{{ opened.data.createdAt }}</span>
            </div>
          </div>
        </IxState>
      </div>
    </div>

    <!-- ── onboard a node beneath one you can reach ──────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.networkPage.createTitle') }}</h2>
        <span class="ix-sub">submerchant.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.networkPage.createLead') }}</p>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-sm-parent">{{ $t('intafaced.pay.networkPage.parent') }}</label>
          <Input element-id="ix-sm-parent" v-model="createForm.parentMerchantId" :placeholder="$t('intafaced.pay.networkPage.merchantIdHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-sm-account">{{ $t('intafaced.pay.networkPage.account') }}</label>
          <Input element-id="ix-sm-account" v-model="createForm.userId" :placeholder="$t('intafaced.pay.networkPage.accountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-sm-fee">{{ $t('intafaced.pay.feeBps') }}</label>
          <Input element-id="ix-sm-fee" v-model="createForm.feeBps" :placeholder="$t('intafaced.pay.feeBpsHint')"></Input>
        </div>
      </div>

      <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
        <strong>{{ $t('intafaced.pay.networkPage.boundsTitle') }}</strong>
        <div style="margin-top:6px;">{{ $t('intafaced.pay.networkPage.boundsBody') }}</div>
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="created.busy" :disabled="!canCreate" @click="submitCreate">
          {{ $t('intafaced.pay.networkPage.createButton') }}
        </Button>
      </div>

      <div v-if="created.ran" style="margin-top:14px;">
        <div v-if="created.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.pay.networkPage.createdOk') }}</strong>
          <div style="margin-top:6px;">{{ created.data.id }}</div>
        </div>
        <IxState v-else :loading="created.busy" :reason="created.reason" :message="created.message" endpoint="/api/pay/trpc/submerchant.create"></IxState>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * MERCHANT NETWORK — svc-pay's `submerchant` router, all three procedures.
 *
 * ── WHY THE TREE IS WALKED, NOT FETCHED ───────────────────────────────────
 * There is no "give me the whole subtree" procedure, and there should not be:
 * `submerchant.list` answers the DIRECT children of one node and re-checks the
 * caller's authority at every node it is asked about. So the screen asks the
 * same question the service answers — one node at a time — and a branch the
 * caller may not read refuses in place, under the node that refused, instead of
 * collapsing the whole tree into one error. That is the honest shape: authority
 * in this model is per-node, and a tree drawn from a single call would have to
 * pretend it is per-tree.
 *
 * ── EVERY ROW CARRIES ITS OWN REFUSAL ─────────────────────────────────────
 * `row.state` is the section shape from module-mixin, held per row rather than
 * on the component, because `load()` writes to `this[key]` and there is no key
 * for "the fourth node down the second branch". The client still RESOLVES
 * rather than rejects, so the branch reason lands in the row and `IxState`
 * renders it verbatim beneath the node it belongs to.
 *
 * ── `feeBps` IS NULLABLE AND IS NOT DEFAULTED TO ZERO ─────────────────────
 * `subMerchantView` types it `nullable()` on purpose — a node onboarded by some
 * other path may carry no rate — and rendering a null as `0` would tell an
 * operator that merchant is processed free of charge. It is also not money: an
 * integer basis-point rate, printed as it arrived. No amount is parsed on this
 * screen because no amount is on it.
 *
 * ── `mode` AND `settlingParty` ARE NOT FORM FIELDS ────────────────────────
 * A node under a parent is `payfac` by construction and the router does not
 * accept `mode` at all. `settlingParty` it does accept, and refuses anything
 * but `'self'` by name — settling a sub-merchant out of our own account is
 * acquiring, which is a sponsor bank and an acquiring BIN, not a form field.
 * The screen therefore sends neither and states the bound instead of drawing a
 * control whose only setting is the default.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPayNetwork',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      rows: [],
      openId: '',
      openedRan: false,
      createForm: { parentMerchantId: '', userId: '', feeBps: '' },
      merchant: this.emptySection(),
      root: this.emptySection(),
      opened: this.emptySection(),
      created: this.emptyAction()
    };
  },
  computed: {
    merchantId() {
      return (this.merchant.data && this.merchant.data.id) || '';
    },
    canCreate() {
      return Boolean(this.createForm.parentMerchantId && this.createForm.userId) && /^\d+$/.test(this.createForm.feeBps);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.loadRoot();
  },
  methods: {
    /**
     * The caller's own node is the root of everything they can reach, and it is
     * read through `submerchant.get` rather than `merchant.me` because only the
     * former carries `parentMerchantId` and `depth` — the two fields that say
     * whether this account is itself somebody else's sub-merchant.
     */
    loadRoot() {
      var self = this;
      this.rows = [];
      this.load('merchant', query('pay', 'merchant.me', undefined, this.ixToken)).then(function(res) {
        if (!res.ok || !res.data) return;
        self.load('root', query('pay', 'submerchant.get', { merchantId: res.data.id }, self.ixToken)).then(function(rootRes) {
          if (!rootRes.ok) return;
          self.rows = [self.makeRow(rootRes.data, 0)];
          if (!self.createForm.parentMerchantId) self.createForm.parentMerchantId = rootRes.data.id;
        });
      });
    },

    makeRow(record, level) {
      return {
        id: record.id,
        record: record,
        level: level,
        expanded: false,
        childCount: null,
        state: { loading: false, reason: null, message: '' }
      };
    },

    indexOfRow(id) {
      for (var i = 0; i < this.rows.length; i++) {
        if (this.rows[i].id === id) return i;
      }
      return -1;
    },

    toggle(row) {
      if (row.expanded) this.collapse(row);
      else this.expand(row);
    },

    /**
     * Drop every row below this one that is deeper than it — the descendants
     * this node put on the table, and only those.
     *
     * REPLACING THE ARRAY RATHER THAN SPLICING IT IN PLACE is not a style
     * choice. Rows arrive from the service after mount, and a plain object
     * spliced into an already-observed array is only made reactive by Vue's own
     * patched array methods — reach past them and the row renders once and then
     * never again, so expanding a CHILD would fetch, resolve, and change
     * nothing on screen. Assigning a fresh array observes every row in it.
     */
    collapse(row) {
      var i = this.indexOfRow(row.id);
      if (i < 0) return;
      var end = i + 1;
      while (end < this.rows.length && this.rows[end].level > row.level) end++;
      row.expanded = false;
      row.childCount = null;
      row.state = { loading: false, reason: null, message: '' };
      this.rows = this.rows.slice(0, i + 1).concat(this.rows.slice(end));
    },

    expand(row) {
      var self = this;
      row.state = { loading: true, reason: null, message: '' };
      // `rows` is reassigned so the in-flight marker is observed too — the row
      // object itself may have been created after the last assignment.
      this.rows = this.rows.slice();
      query('pay', 'submerchant.list', { merchantId: row.id }, this.ixToken).then(function(res) {
        var at = self.indexOfRow(row.id);
        if (at < 0) return;
        var current = self.rows[at];
        current.state = {
          loading: false,
          reason: res.ok ? 'ok' : res.reason,
          message: res.ok ? '' : res.message
        };
        if (!res.ok) {
          self.rows = self.rows.slice();
          return;
        }
        var made = [];
        for (var i = 0; i < res.data.length; i++) made.push(self.makeRow(res.data[i], current.level + 1));
        current.expanded = true;
        current.childCount = res.data.length;
        self.rows = self.rows.slice(0, at + 1).concat(made, self.rows.slice(at + 1));
      });
    },

    useAsParent(row) {
      this.createForm.parentMerchantId = row.id;
    },

    openNode() {
      if (!this.openId) return;
      this.openedRan = true;
      this.load('opened', query('pay', 'submerchant.get', { merchantId: this.openId }, this.ixToken));
    },

    submitCreate() {
      var self = this;
      if (!this.canCreate) return;
      this.act(
        'created',
        mutate(
          'pay',
          'submerchant.create',
          {
            parentMerchantId: this.createForm.parentMerchantId,
            userId: this.createForm.userId,
            // A rate in whole basis points — an integer the router types as a
            // JSON number. It is not an amount, and it is the only field on
            // this screen that is parsed at all.
            pricing: { feeBps: parseInt(this.createForm.feeBps, 10) }
          },
          this.ixToken
        )
      ).then(function(res) {
        if (!res.ok) return;
        self.createForm.userId = '';
        self.createForm.feeBps = '';
        self.loadRoot();
      });
    }
  }
};
</script>
