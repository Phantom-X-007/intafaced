<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.pay.permissionsPage.title') }}</h1>
      <p>{{ $t('intafaced.pay.permissionsPage.lead') }}</p>
      <div class="ix-source">svc-pay · submerchantPermission.areas · list · history · grant · revoke</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.pay.nav.aria" />

    <!-- ── the vocabulary, read from the service ────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.permissionsPage.areasTitle') }}</h2>
        <span class="ix-sub">submerchantPermission.areas</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.permissionsPage.areasLead') }}</p>
      <IxState :loading="areas.loading" :reason="areas.reason" :message="areas.message" endpoint="/api/pay/trpc/submerchantPermission.areas">
        <div v-if="areaList.length" class="ix-tags">
          <span v-for="a in areaList" :key="a" class="ix-tag">{{ a }}</span>
        </div>
      </IxState>
    </div>

    <!-- ── which node is this about ─────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.pay.permissionsPage.subjectTitle') }}</h2>
        <span class="ix-sub">submerchantPermission.list · submerchantPermission.history</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.pay.permissionsPage.subjectLead') }}</p>
      <div class="ix-form-row">
        <div class="ix-field">
          <label for="ix-perm-subject">{{ $t('intafaced.pay.permissionsPage.subject') }}</label>
          <Input element-id="ix-perm-subject" v-model="subjectId" :placeholder="$t('intafaced.pay.permissionsPage.merchantIdHint')" @on-enter="reload"></Input>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :disabled="!subjectId" @click="reload">{{ $t('intafaced.pay.permissionsPage.readNode') }}</Button>
        </div>
      </div>
    </div>

    <template v-if="ran">
      <!-- ── who holds what over it, right now ──────────────────────────── -->
      <div class="ix-card">
        <div class="ix-card-head">
          <h2>{{ $t('intafaced.pay.permissionsPage.grantsTitle') }}</h2>
          <span class="ix-sub">submerchantPermission.list</span>
        </div>
        <p class="ix-lead">{{ $t('intafaced.pay.permissionsPage.grantsLead') }}</p>
        <IxState :loading="grants.loading" :reason="grants.reason" :message="grants.message" endpoint="/api/pay/trpc/submerchantPermission.list">
          <div v-if="grants.data && grants.data.length" class="ix-scroll">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.pay.permissionsPage.grantee') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.area') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.reason') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.actor') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.grantedAt') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in grants.data" :key="g.granteeMerchantId + ':' + g.area">
                  <td style="font-size:13px;">{{ g.granteeMerchantId }}</td>
                  <td>{{ g.area }}</td>
                  <td>{{ g.reason }}</td>
                  <td style="font-size:13px;">{{ g.actorId }}</td>
                  <td>{{ g.grantedAt }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.permissionsPage.noGrants') }}</div>
        </IxState>
      </div>

      <!-- ── the journal ────────────────────────────────────────────────── -->
      <div class="ix-card">
        <div class="ix-card-head">
          <h2>{{ $t('intafaced.pay.permissionsPage.historyTitle') }}</h2>
          <span class="ix-sub">submerchantPermission.history</span>
        </div>
        <p class="ix-lead">{{ $t('intafaced.pay.permissionsPage.historyLead') }}</p>
        <IxState :loading="history.loading" :reason="history.reason" :message="history.message" endpoint="/api/pay/trpc/submerchantPermission.history">
          <div v-if="history.data && history.data.length" class="ix-scroll">
            <table class="ix-table">
              <thead>
                <tr>
                  <th>{{ $t('intafaced.pay.permissionsPage.seq') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.action') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.area') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.grantee') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.reason') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.actor') }}</th>
                  <th>{{ $t('intafaced.pay.permissionsPage.actorScope') }}</th>
                  <th>{{ $t('intafaced.pay.at') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in history.data" :key="e.id">
                  <td>{{ e.seq }}</td>
                  <td>{{ e.action }}</td>
                  <td>{{ e.area }}</td>
                  <td style="font-size:13px;">{{ e.granteeMerchantId }}</td>
                  <td>{{ e.reason }}</td>
                  <td style="font-size:13px;">{{ e.actorId }}</td>
                  <td>{{ e.actorScope }}</td>
                  <td>{{ e.createdAt }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.pay.permissionsPage.noHistory') }}</div>
        </IxState>
      </div>

      <!-- ── delegate it, or take it back ───────────────────────────────── -->
      <div class="ix-card">
        <div class="ix-card-head">
          <h2>{{ $t('intafaced.pay.permissionsPage.changeTitle') }}</h2>
          <span class="ix-sub">submerchantPermission.grant · submerchantPermission.revoke</span>
        </div>
        <p class="ix-lead">{{ $t('intafaced.pay.permissionsPage.changeLead') }}</p>

        <div class="ix-field-grid">
          <div class="ix-field">
            <label for="ix-perm-grantee">{{ $t('intafaced.pay.permissionsPage.grantee') }}</label>
            <Input element-id="ix-perm-grantee" v-model="form.granteeMerchantId" :placeholder="$t('intafaced.pay.permissionsPage.merchantIdHint')"></Input>
          </div>
          <div class="ix-field">
            <!-- The vendor Select renders no labelable element, so this label
                 names the field without a `for` that would point at nothing. -->
            <label>{{ $t('intafaced.pay.permissionsPage.area') }}</label>
            <Select v-model="form.area" :disabled="!areaList.length">
              <Option v-for="a in areaList" :key="a" :value="a" :label="a"></Option>
            </Select>
          </div>
          <div class="ix-field">
            <label for="ix-perm-reason">{{ $t('intafaced.pay.permissionsPage.reason') }}</label>
            <Input element-id="ix-perm-reason" v-model="form.reason" :placeholder="$t('intafaced.pay.permissionsPage.reasonHint')"></Input>
          </div>
        </div>

        <div v-if="!areaList.length" class="ix-note ix-note-quiet" style="margin-bottom:14px;">
          {{ $t('intafaced.pay.permissionsPage.noVocabulary') }}
        </div>

        <div class="ix-note ix-note-quiet" style="margin-bottom:14px;">
          <strong>{{ $t('intafaced.pay.permissionsPage.downhillTitle') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.pay.permissionsPage.downhillBody') }}</div>
        </div>

        <div class="ix-actions">
          <Button type="primary" :loading="changed.busy" :disabled="!canChange" @click="submit('grant')">
            {{ $t('intafaced.pay.permissionsPage.grant') }}
          </Button>
          <Button :loading="changed.busy" :disabled="!canChange" @click="submit('revoke')">
            {{ $t('intafaced.pay.permissionsPage.revoke') }}
          </Button>
        </div>

        <div v-if="changed.ran" style="margin-top:14px;">
          <div v-if="changed.reason === 'ok'" class="ix-done">
            <strong>{{ changed.data.action === 'revoke' ? $t('intafaced.pay.permissionsPage.revoked') : $t('intafaced.pay.permissionsPage.granted') }}</strong>
            <div style="margin-top:6px;">{{ $t('intafaced.pay.permissionsPage.seq') }} {{ changed.data.seq }} · {{ changed.data.area }}</div>
          </div>
          <IxState v-else :loading="changed.busy" :reason="changed.reason" :message="changed.message" :endpoint="'/api/pay/trpc/submerchantPermission.' + lastAction"></IxState>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
/**
 * PERMISSIONS — svc-pay's `submerchantPermission` router, all five procedures.
 *
 * ── THE AREA LIST IS READ, NEVER TYPED HERE ───────────────────────────────
 * `submerchantPermission.areas` exists precisely so a console does not keep its
 * own copy: a second list is a list that goes stale, and a stale one draws a
 * control for an area nothing enforces. So when that call refuses, the select
 * is EMPTY and disabled and the screen says why, rather than falling back to a
 * hard-coded vocabulary that would look right and mean nothing.
 *
 * ── A SUBJECT IS ASKED FOR, NOT ASSUMED ───────────────────────────────────
 * Every read here names the node the grants are ABOUT. It is prefilled from
 * `?subject=` so the network screen can hand a node over, and it is still an
 * editable field because `submerchantPermission.list` will answer for any node
 * inside the caller's subtree — the fence is the service's, not this form's.
 *
 * ── WHAT `list` DOES NOT CONTAIN ──────────────────────────────────────────
 * The root of a tree holds every area over every node beneath it, implicitly,
 * and no journal row records that — it is a property of being the root. So an
 * empty grants table is not "nobody can touch this node"; it is "no grant was
 * ever made over it", which is the sentence the empty state writes.
 *
 * ── `reason` IS REQUIRED BECAUSE THE SERVICE REQUIRES IT ──────────────────
 * `min(3)` on the wire, and it is stored on the journal row. Why one node holds
 * refund authority over another has to be answerable from the database later,
 * so the button stays disabled until there is something to store.
 *
 * No money reaches this screen. `seq` is a `bigserial` ordering key that arrives
 * as a string and is printed as one — never arithmetic, never a number.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { PAY_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxPayPermissions',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: PAY_NAV,
      subjectId: '',
      ran: false,
      lastAction: 'grant',
      form: { granteeMerchantId: '', area: '', reason: '' },
      areas: this.emptySection(),
      grants: this.emptySection(),
      history: this.emptySection(),
      changed: this.emptyAction()
    };
  },
  computed: {
    areaList() {
      return this.areas.data || [];
    },
    canChange() {
      return Boolean(
        this.subjectId && this.form.granteeMerchantId && this.form.area && this.form.reason.trim().length >= 3
      );
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('areas', query('pay', 'submerchantPermission.areas', undefined, this.ixToken));

    // Handed over by the network screen. A node id in the URL is not a
    // capability — every call below is still fenced to the caller's own subtree
    // by the service — so it is safe to act on and saves retyping a uuid.
    var subject = this.$route.query.subject;
    if (typeof subject === 'string' && subject) {
      this.subjectId = subject;
      this.reload();
    }
  },
  methods: {
    reload() {
      if (!this.subjectId) return;
      this.ran = true;
      this.load('grants', query('pay', 'submerchantPermission.list', { subjectMerchantId: this.subjectId }, this.ixToken));
      this.load('history', query('pay', 'submerchantPermission.history', { subjectMerchantId: this.subjectId }, this.ixToken));
    },

    submit(action) {
      var self = this;
      if (!this.canChange) return;
      this.lastAction = action;
      this.act(
        'changed',
        mutate(
          'pay',
          'submerchantPermission.' + action,
          {
            granteeMerchantId: this.form.granteeMerchantId,
            subjectMerchantId: this.subjectId,
            area: this.form.area,
            reason: this.form.reason.trim()
          },
          this.ixToken
        )
      ).then(function(res) {
        if (res.ok) self.reload();
      });
    }
  }
};
</script>
