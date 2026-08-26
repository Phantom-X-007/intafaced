<template>
  <div class="ix-page bank-page platform-module-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.ops.biz.title') }}</h1>
      <p>{{ $t('intafaced.ops.biz.lead') }}</p>
      <details class="bank-details"><summary>Details</summary><code>svc-ops · /api/ops/trpc · ops.warehouse_unwired · ops.payroll_invent_forbidden · ops.fundraising_chain_unwired · ops.custody_wrap_unset · ops.custody_chain_unwired</code></details>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.ops.biz.contacts') }}</h2>
        <span class="ix-sub">contacts · createContact</span>
      </div>
      <div class="ix-form">
        <label>{{ $t('intafaced.ops.biz.contactName') }} <Input v-model="contactForm.displayName" /></label>
        <label>{{ $t('intafaced.ops.biz.contactEmail') }} <Input v-model="contactForm.email" /></label>
        <Button type="primary" :loading="createdContact.busy" @click="addContact">{{ $t('intafaced.ops.biz.addContact') }}</Button>
      </div>
      <IxState compact v-if="createdContact.ran" :loading="createdContact.busy" :reason="createdContact.reason" :message="createdContact.message" endpoint="/api/ops/trpc/createContact">
        <div v-if="createdContact.data" class="ix-note ix-note-success">{{ $t('intafaced.ops.biz.contactAdded') }} · {{ createdContact.data.displayName }}</div>
      </IxState>
      <IxState compact :loading="contacts.loading" :reason="contacts.reason" :message="contacts.message" endpoint="/api/ops/trpc/contacts">
        <div v-if="contacts.data && contacts.data.contacts && contacts.data.contacts.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.biz.contactName') }}</th><th>{{ $t('intafaced.ops.biz.contactEmail') }}</th><th>{{ $t('intafaced.ops.biz.source') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in contacts.data.contacts" :key="row.id">
                <td>{{ row.displayName }}</td>
                <td>{{ row.email || '—' }}</td>
                <td>{{ row.source }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.biz.contactsEmpty') }}</div>
        <div v-if="contacts.data && contacts.data.identity && contacts.data.identity.code" class="ix-note ix-note-quiet">{{ contacts.data.identity.code }}</div>
        <div v-if="contacts.data && contacts.data.support && contacts.data.support.code" class="ix-note ix-note-quiet">{{ contacts.data.support.code }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.ops.biz.team') }}</h2>
        <span class="ix-sub">team · ops.payroll_invent_forbidden</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.ops.biz.payrollForbidden') }}</p>
      <div class="ix-form">
        <label>{{ $t('intafaced.ops.biz.handle') }} <Input v-model="teamForm.handle" /></label>
        <label>{{ $t('intafaced.ops.biz.role') }} <Input v-model="teamForm.role" /></label>
        <Button type="primary" :loading="createdMember.busy" @click="addMember">{{ $t('intafaced.ops.biz.addMember') }}</Button>
      </div>
      <IxState compact v-if="createdMember.ran" :loading="createdMember.busy" :reason="createdMember.reason" :message="createdMember.message" endpoint="/api/ops/trpc/createTeamMember">
        <div v-if="createdMember.data" class="ix-note ix-note-success">{{ createdMember.data.handle }} · {{ createdMember.data.role }}</div>
      </IxState>
      <IxState compact :loading="team.loading" :reason="team.reason" :message="team.message" endpoint="/api/ops/trpc/team">
        <div v-if="team.data && team.data.members && team.data.members.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.biz.handle') }}</th><th>{{ $t('intafaced.ops.biz.role') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in team.data.members" :key="row.id">
                <td>{{ row.handle }}</td>
                <td>{{ row.role }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.biz.teamEmpty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.ops.biz.revenue') }}</h2>
        <span class="ix-sub">revenue · ops.warehouse_unwired</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.ops.biz.warehouseUnwired') }}</p>
      <IxState compact :loading="revenue.loading" :reason="revenue.reason" :message="revenue.message" endpoint="/api/ops/trpc/revenue">
        <div v-if="revenue.data && revenue.data.empty" class="ix-note ix-note-quiet">{{ $t('intafaced.ops.biz.revenueEmpty') }}</div>
        <div v-else-if="revenue.data && revenue.data.points && revenue.data.points.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.biz.metric') }}</th><th>{{ $t('intafaced.ops.biz.amount') }}</th></tr></thead>
            <tbody>
              <tr v-for="p in revenue.data.points" :key="p.metricId">
                <td>{{ p.metricId }}</td>
                <td>{{ p.value }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.ops.biz.projects') }}</h2>
        <span class="ix-sub">projects.list · projects.create</span>
      </div>
      <div class="ix-form">
        <label>{{ $t('intafaced.ops.biz.projectTitle') }} <Input v-model="projectForm.title" /></label>
        <Button type="primary" :loading="createdProject.busy" @click="addProject">{{ $t('intafaced.ops.biz.createProject') }}</Button>
      </div>
      <IxState compact v-if="createdProject.ran" :loading="createdProject.busy" :reason="createdProject.reason" :message="createdProject.message" endpoint="/api/ops/trpc/projects.create">
        <div v-if="createdProject.data" class="ix-note ix-note-success">{{ $t('intafaced.ops.biz.projectCreated') }} · {{ createdProject.data.title }}</div>
      </IxState>
      <IxState compact :loading="projects.loading" :reason="projects.reason" :message="projects.message" endpoint="/api/ops/trpc/projects.list">
        <div v-if="projects.data && projects.data.projects && projects.data.projects.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.biz.projectTitle') }}</th><th>{{ $t('intafaced.ops.biz.status') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in projects.data.projects" :key="row.id">
                <td>{{ row.title }}</td>
                <td>{{ row.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.biz.projectsEmpty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.ops.fundraising.title') }}</h2>
        <span class="ix-sub">fundraising.create · fundraising.milestones</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.ops.fundraising.lead') }}</p>
      <p class="ix-lead">{{ $t('intafaced.ops.fundraising.chainUnwired') }}</p>
      <div class="ix-form">
        <label>{{ $t('intafaced.ops.fundraising.name') }} <Input v-model="raiseForm.name" /></label>
        <label>{{ $t('intafaced.ops.fundraising.milestones') }} <Input v-model="raiseForm.milestoneLabels" /></label>
        <label>{{ $t('intafaced.ops.fundraising.targetAmount') }} <Input v-model="raiseForm.targetAmount" /></label>
        <Button type="primary" :loading="createdRaise.busy" @click="addRaise">{{ $t('intafaced.ops.fundraising.create') }}</Button>
      </div>
      <IxState compact v-if="createdRaise.ran" :loading="createdRaise.busy" :reason="createdRaise.reason" :message="createdRaise.message" endpoint="/api/ops/trpc/fundraising.create">
        <div v-if="createdRaise.data" class="ix-note ix-note-success">{{ $t('intafaced.ops.fundraising.created') }} · {{ createdRaise.data.name }}</div>
      </IxState>
      <IxState compact :loading="raises.loading" :reason="raises.reason" :message="raises.message" endpoint="/api/ops/trpc/fundraising.list">
        <div v-if="raises.data && raises.data.raises && raises.data.raises.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.fundraising.name') }}</th><th>{{ $t('intafaced.ops.fundraising.targetAmount') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in raises.data.raises" :key="row.id">
                <td>{{ row.name }}</td>
                <td>{{ row.targetAmount || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.fundraising.empty') }}</div>
      </IxState>
      <IxState compact :loading="milestones.loading" :reason="milestones.reason" :message="milestones.message" endpoint="/api/ops/trpc/fundraising.milestones">
        <div v-if="milestones.data && milestones.data.milestones && milestones.data.milestones.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.fundraising.name') }}</th><th>{{ $t('intafaced.ops.fundraising.milestoneLabel') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in milestones.data.milestones" :key="row.id">
                <td>{{ raiseName(row.raiseId) }}</td>
                <td>{{ row.label }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.fundraising.milestonesEmpty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.ops.custody.title') }}</h2>
        <span class="ix-sub">{{ $t('intafaced.ops.custody.api') }}</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.ops.custody.lead') }}</p>
      <p class="ix-lead">{{ $t('intafaced.ops.custody.wrapUnset') }}</p>
      <p class="ix-lead">{{ $t('intafaced.ops.custody.chainUnwired') }}</p>
      <IxState compact :loading="custody.loading" :reason="custody.reason" :message="custody.message" endpoint="/api/ops/trpc/custody.list">
        <div v-if="custody.data && custody.data.wrap && custody.data.wrap.code" class="ix-note ix-note-quiet">{{ custody.data.wrap.code }}</div>
        <div v-if="custody.data && custody.data.tiers && custody.data.tiers.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.custody.tier') }}</th><th>{{ $t('intafaced.ops.custody.keys') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in custody.data.tiers" :key="row.id">
                <td>{{ $t('intafaced.ops.custody.' + row.id) }}</td>
                <td>{{ row.keys && row.keys.length ? row.keys.length : $t('intafaced.ops.custody.keysEmpty') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.custody.keysEmpty') }}</div>
        <div v-if="custody.data && custody.data.approvals && custody.data.approvals.length" class="ix-scroll">
          <table class="ix-table">
            <thead><tr><th>{{ $t('intafaced.ops.custody.fromTier') }}</th><th>{{ $t('intafaced.ops.custody.toTier') }}</th><th>{{ $t('intafaced.ops.custody.amount') }}</th><th>{{ $t('intafaced.ops.custody.status') }}</th></tr></thead>
            <tbody>
              <tr v-for="row in custody.data.approvals" :key="row.id">
                <td>{{ $t('intafaced.ops.custody.' + row.fromTier) }}</td>
                <td>{{ $t('intafaced.ops.custody.' + row.toTier) }}</td>
                <td>{{ row.amount || '—' }}</td>
                <td>{{ row.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.ops.custody.approvalsEmpty') }}</div>
      </IxState>
      <div class="ix-form">
        <label>{{ $t('intafaced.ops.custody.fromTier') }} <Input v-model="approvalForm.fromTier" /></label>
        <label>{{ $t('intafaced.ops.custody.toTier') }} <Input v-model="approvalForm.toTier" /></label>
        <label>{{ $t('intafaced.ops.custody.amount') }} <Input v-model="approvalForm.amount" /></label>
        <Button type="primary" :loading="createdApproval.busy" @click="addApproval">{{ $t('intafaced.ops.custody.request') }}</Button>
        <Button :loading="executedApproval.busy" @click="executeApproval">{{ $t('intafaced.ops.custody.execute') }}</Button>
      </div>
      <IxState compact v-if="createdApproval.ran" :loading="createdApproval.busy" :reason="createdApproval.reason" :message="createdApproval.message" endpoint="/api/ops/trpc/custody.createApproval">
        <div v-if="createdApproval.data" class="ix-note ix-note-success">{{ $t('intafaced.ops.custody.requested') }} · {{ createdApproval.data.fromTier }} → {{ createdApproval.data.toTier }}</div>
      </IxState>
      <IxState compact v-if="executedApproval.ran" :loading="executedApproval.busy" :reason="executedApproval.reason" :message="executedApproval.message" endpoint="/api/ops/trpc/custody.execute">
      </IxState>
    </div>
  </div>
</template>
<script>
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';
export default {
  name: 'IxOps',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      contactForm: { displayName: '', email: '' },
      teamForm: { handle: '', role: 'operator' },
      projectForm: { title: '' },
      raiseForm: { name: '', milestoneLabels: '', targetAmount: '' },
      approvalForm: { fromTier: 'cold', toTier: 'hot', amount: '' },
      contacts: this.emptySection(),
      team: this.emptySection(),
      revenue: this.emptySection(),
      projects: this.emptySection(),
      raises: this.emptySection(),
      milestones: this.emptySection(),
      custody: this.emptySection(),
      createdContact: this.emptyAction(),
      createdMember: this.emptyAction(),
      createdProject: this.emptyAction(),
      createdRaise: this.emptyAction(),
      createdApproval: this.emptyAction(),
      executedApproval: this.emptyAction()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.loadContacts();
    this.loadTeam();
    this.loadRevenue();
    this.loadProjects();
    this.loadRaises();
    this.loadMilestones();
    this.loadCustody();
  },
  methods: {
    loadContacts() { this.load('contacts', query('ops', 'contacts', undefined, this.ixToken)); },
    loadTeam() { this.load('team', query('ops', 'team', undefined, this.ixToken)); },
    loadRevenue() { this.load('revenue', query('ops', 'revenue', undefined, this.ixToken)); },
    loadProjects() { this.load('projects', query('ops', 'projects.list', undefined, this.ixToken)); },
    addContact() {
      var self = this;
      this.act('createdContact', mutate('ops', 'createContact', this.contactForm, this.ixToken)).then(function(res) {
        if (res && res.ok) {
          self.contactForm = { displayName: '', email: '' };
          self.loadContacts();
        }
      });
    },
    addMember() {
      var self = this;
      this.act('createdMember', mutate('ops', 'createTeamMember', this.teamForm, this.ixToken)).then(function(res) {
        if (res && res.ok) {
          self.teamForm = { handle: '', role: 'operator' };
          self.loadTeam();
        }
      });
    },
    addProject() {
      var self = this;
      this.act('createdProject', mutate('ops', 'projects.create', this.projectForm, this.ixToken)).then(function(res) {
        if (res && res.ok) {
          self.projectForm = { title: '' };
          self.loadProjects();
        }
      });
    },
    loadRaises() { this.load('raises', query('ops', 'fundraising.list', undefined, this.ixToken)); },
    loadMilestones() { this.load('milestones', query('ops', 'fundraising.milestones', undefined, this.ixToken)); },
    raiseName(raiseId) {
      var rows = this.raises.data && this.raises.data.raises ? this.raises.data.raises : [];
      for (var i = 0; i < rows.length; i += 1) {
        if (rows[i].id === raiseId) return rows[i].name;
      }
      return raiseId;
    },
    addRaise() {
      var self = this;
      var labels = String(this.raiseForm.milestoneLabels || '').split(',').map(function(part) {
        return part.trim();
      }).filter(Boolean);
      var payload = { name: this.raiseForm.name, milestoneLabels: labels };
      var amount = String(this.raiseForm.targetAmount || '').trim();
      if (amount) payload.targetAmount = amount;
      this.act('createdRaise', mutate('ops', 'fundraising.create', payload, this.ixToken)).then(function(res) {
        if (res && res.ok) {
          self.raiseForm = { name: '', milestoneLabels: '', targetAmount: '' };
          self.loadRaises();
          self.loadMilestones();
        }
      });
    },
    loadCustody() { this.load('custody', query('ops', 'custody.list', undefined, this.ixToken)); },
    addApproval() {
      var self = this;
      var payload = { fromTier: this.approvalForm.fromTier, toTier: this.approvalForm.toTier };
      var amount = String(this.approvalForm.amount || '').trim();
      if (amount) payload.amount = amount;
      this.act('createdApproval', mutate('ops', 'custody.createApproval', payload, this.ixToken)).then(function(res) {
        if (res && res.ok) {
          self.approvalForm = { fromTier: 'cold', toTier: 'hot', amount: '' };
          self.loadCustody();
        }
      });
    },
    executeApproval() {
      this.act('executedApproval', mutate('ops', 'custody.execute', {}, this.ixToken));
    }
  }
};
</script>
