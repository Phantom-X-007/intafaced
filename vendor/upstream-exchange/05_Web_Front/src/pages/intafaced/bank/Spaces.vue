<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.bank.spaces') }}</h1>
      <p>{{ $t('intafaced.bank.spacesPage.lead') }}</p>
      <div class="ix-source">svc-bank · spaces.list · spaces.unnamed · spaces.create · spaces.archive</div>
    </div>

    <IxSubNav :items="nav" label-key="intafaced.bank.nav.aria" />

    <!-- ── the spaces themselves ───────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.spaces') }}</h2>
        <span class="ix-sub">spaces.list</span>
      </div>
      <div class="ix-form-row" style="margin-bottom:16px;">
        <div class="ix-field">
          <label for="ix-space-filter">{{ $t('intafaced.bank.filterAsset') }}</label>
          <Input element-id="ix-space-filter" v-model="filterAsset" :placeholder="$t('intafaced.bank.filterAssetHint')" @on-enter="reloadSpaces"></Input>
        </div>
        <div class="ix-form-action">
          <Button size="small" @click="reloadSpaces">{{ $t('intafaced.state.refresh') }}</Button>
        </div>
      </div>

      <IxState :loading="spaces.loading" :reason="spaces.reason" :message="spaces.message" endpoint="/api/bank/trpc/spaces.list">
        <div v-if="spaces.data && spaces.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.bank.spaceName') }}</th>
                <th>{{ $t('intafaced.pay.asset') }}</th>
                <th>{{ $t('intafaced.bank.kind') }}</th>
                <th>{{ $t('intafaced.bank.balance') }}</th>
                <th>{{ $t('intafaced.bank.goal') }}</th>
                <th>{{ $t('intafaced.bank.lockedUntil') }}</th>
                <th>{{ $t('intafaced.bank.ledgerAccount') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in spaces.data" :key="s.id">
                <td>{{ s.name }}</td>
                <td>{{ s.assetId }}</td>
                <td>{{ s.kind }}</td>
                <td>{{ s.balance }}</td>
                <td>{{ s.goalTarget === null ? '—' : s.goalTarget }}</td>
                <td>{{ s.lockedUntil === null ? '—' : s.lockedUntil }}</td>
                <td>{{ s.ledgerAccount.ownerType }}/{{ s.ledgerAccount.kind }}</td>
                <td>
                  <Button
                    v-if="s.kind !== 'primary'"
                    size="small"
                    :loading="archive.busy && archivingId === s.id"
                    @click="archiveSpace(s)"
                  >{{ $t('intafaced.bank.archive') }}</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.overview.noSpaces') }}</div>
      </IxState>

      <div v-if="archive.ran" style="margin-top:14px;">
        <div v-if="archive.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.archived') }}</strong>
        </div>
        <IxState v-else :loading="archive.busy" :reason="archive.reason" :message="archive.message" endpoint="/api/bank/trpc/spaces.archive"></IxState>
      </div>
    </div>

    <!-- ── create a space ──────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.createSpace') }}</h2>
        <span class="ix-sub">spaces.create</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.spacesPage.createLead') }}</p>

      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-space-asset">{{ $t('intafaced.pay.asset') }}</label>
          <Input element-id="ix-space-asset" v-model="form.assetId" :placeholder="$t('intafaced.bank.assetHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-space-name">{{ $t('intafaced.bank.spaceName') }}</label>
          <Input element-id="ix-space-name" v-model="form.name" :placeholder="$t('intafaced.bank.spaceNameHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-space-goal">{{ $t('intafaced.bank.goalOptional') }}</label>
          <Input element-id="ix-space-goal" v-model="form.goalTarget" :placeholder="$t('intafaced.bank.amountHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-space-lock">{{ $t('intafaced.bank.lockedUntilOptional') }}</label>
          <Input element-id="ix-space-lock" v-model="form.lockedUntil" :placeholder="$t('intafaced.bank.isoHint')"></Input>
        </div>
      </div>

      <div class="ix-actions">
        <Button type="primary" :loading="create.busy" :disabled="!canCreate" @click="createSpace">
          {{ $t('intafaced.bank.createSpace') }}
        </Button>
      </div>

      <div v-if="create.ran" style="margin-top:14px;">
        <div v-if="create.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.bank.spaceCreated') }}</strong>
          <div style="margin-top:6px;">{{ create.data.name }} · {{ create.data.id }}</div>
        </div>
        <IxState v-else :loading="create.busy" :reason="create.reason" :message="create.message" endpoint="/api/bank/trpc/spaces.create"></IxState>
      </div>
    </div>

    <!-- ── assets with no space ────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.bank.unnamed') }}</h2>
        <span class="ix-sub">spaces.unnamed</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.bank.overview.unnamedLead') }}</p>
      <IxState :loading="unnamed.loading" :reason="unnamed.reason" :message="unnamed.message" endpoint="/api/bank/trpc/spaces.unnamed">
        <div v-if="unnamed.data && unnamed.data.length" class="ix-kv">
          <div v-for="u in unnamed.data" :key="u.assetId" class="ix-kv-item">
            <span class="k">{{ u.assetId }}</span>
            <span class="v">{{ u.balance }}</span>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.bank.overview.noUnnamed') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * SPACES — svc-bank's `spaces` router, all four procedures.
 *
 * A space is a VIEW of a ledger account, not a second balance: `spaces.list`
 * carries `ledgerAccount` so a reader can check us against the book, and this
 * screen prints it for exactly that reason. The balance is the decimal string
 * svc-bank read from the ledger at request time and it is rendered verbatim —
 * no sum, no total row, no conversion, because a total would need a price
 * source this platform does not publish.
 *
 * `archive` is offered on named spaces only. The primary space is where value
 * arrives from every other module (`ensurePrimary` in the router), so archiving
 * it is not a gesture we should draw a button for.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import IxSubNav from '../../../components/intafaced/IxSubNav.vue';
import { query, mutate } from '../../../config/intafaced.js';
import { BANK_NAV } from '../../../config/ix-nav.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBankSpaces',
  components: { IxState, IxSubNav },
  mixins: [ixModule],
  data() {
    return {
      nav: BANK_NAV,
      filterAsset: '',
      archivingId: '',
      form: { assetId: '', name: '', goalTarget: '', lockedUntil: '' },
      spaces: this.emptySection(),
      unnamed: this.emptySection(),
      create: this.emptyAction(),
      archive: this.emptyAction()
    };
  },
  computed: {
    canCreate() {
      return Boolean(this.form.assetId && this.form.name);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.reloadSpaces();
    this.load('unnamed', query('bank', 'spaces.unnamed', undefined, this.ixToken));
  },
  methods: {
    reloadSpaces() {
      var input = this.filterAsset ? { assetId: this.filterAsset } : {};
      this.load('spaces', query('bank', 'spaces.list', input, this.ixToken));
    },
    createSpace() {
      var self = this;
      if (!this.canCreate) return;
      var input = { assetId: this.form.assetId, name: this.form.name };
      // Optional fields are OMITTED when blank, never sent as an empty string:
      // `goalTarget` is an amount string and `lockedUntil` a datetime, and ''
      // fails both schemas — which would surface as a validation error about a
      // field the reader deliberately left alone.
      if (this.form.goalTarget) input.goalTarget = this.form.goalTarget;
      if (this.form.lockedUntil) input.lockedUntil = this.form.lockedUntil;

      this.act('create', mutate('bank', 'spaces.create', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.form = { assetId: '', name: '', goalTarget: '', lockedUntil: '' };
        self.reloadSpaces();
        self.load('unnamed', query('bank', 'spaces.unnamed', undefined, self.ixToken));
      });
    },
    archiveSpace(space) {
      var self = this;
      this.archivingId = space.id;
      this.act('archive', mutate('bank', 'spaces.archive', { spaceId: space.id }, this.ixToken)).then(function(res) {
        self.archivingId = '';
        if (res.ok) self.reloadSpaces();
      });
    }
  }
};
</script>
