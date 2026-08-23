<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.ops.biz.title') }}</h1>
      <p>{{ $t('intafaced.ops.biz.lead') }}</p>
      <div class="ix-source">svc-ops · /api/ops/trpc · ops.warehouse_unwired · ops.payroll_invent_forbidden</div>
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
      <IxState v-if="createdContact.ran" :loading="createdContact.busy" :reason="createdContact.reason" :message="createdContact.message" endpoint="/api/ops/trpc/createContact">
        <div v-if="createdContact.data" class="ix-note ix-note-success">{{ $t('intafaced.ops.biz.contactAdded') }} · {{ createdContact.data.displayName }}</div>
      </IxState>
      <IxState :loading="contacts.loading" :reason="contacts.reason" :message="contacts.message" endpoint="/api/ops/trpc/contacts">
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
      <IxState v-if="createdMember.ran" :loading="createdMember.busy" :reason="createdMember.reason" :message="createdMember.message" endpoint="/api/ops/trpc/createTeamMember">
        <div v-if="createdMember.data" class="ix-note ix-note-success">{{ createdMember.data.handle }} · {{ createdMember.data.role }}</div>
      </IxState>
      <IxState :loading="team.loading" :reason="team.reason" :message="team.message" endpoint="/api/ops/trpc/team">
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
      <IxState :loading="revenue.loading" :reason="revenue.reason" :message="revenue.message" endpoint="/api/ops/trpc/revenue">
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
      <IxState v-if="createdProject.ran" :loading="createdProject.busy" :reason="createdProject.reason" :message="createdProject.message" endpoint="/api/ops/trpc/projects.create">
        <div v-if="createdProject.data" class="ix-note ix-note-success">{{ $t('intafaced.ops.biz.projectCreated') }} · {{ createdProject.data.title }}</div>
      </IxState>
      <IxState :loading="projects.loading" :reason="projects.reason" :message="projects.message" endpoint="/api/ops/trpc/projects.list">
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
      contacts: this.emptySection(),
      team: this.emptySection(),
      revenue: this.emptySection(),
      projects: this.emptySection(),
      createdContact: this.emptyAction(),
      createdMember: this.emptyAction(),
      createdProject: this.emptyAction()
    };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.loadContacts();
    this.loadTeam();
    this.loadRevenue();
    this.loadProjects();
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
    }
  }
};
</script>
