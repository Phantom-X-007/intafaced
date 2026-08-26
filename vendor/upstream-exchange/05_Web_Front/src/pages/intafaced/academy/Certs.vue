<template>
  <div class="ix-card">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.academy.certs') }}</h2>
      <span class="ix-sub">myCerts · certProgress · grantCert · enrollCertPath</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.academy.certsLead') }}</p>

    <IxState compact :loading="definitions.loading" :reason="definitions.reason" :message="definitions.message" endpoint="/api/academy/trpc/certDefinitions">
      <div v-if="definitions.data && definitions.data.length" class="ix-scroll">
        <table class="ix-table">
          <thead>
            <tr>
              <th>{{ $t('intafaced.academy.certTitle') }}</th>
              <th>{{ $t('intafaced.academy.certId') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in definitions.data" :key="row.id">
              <td>{{ row.title }}</td>
              <td>{{ row.id }}</td>
              <td>
                <div class="ix-actions">
                  <Button size="small" :loading="progress.loading && selectedCertId === row.id" @click="openCert(row.id)">
                    {{ $t('intafaced.academy.open') }}
                  </Button>
                  <Button v-if="canWrite" type="primary" size="small" :disabled="grantBlocked(row.id)" :loading="grantAction.busy && selectedCertId === row.id" @click="grant(row.id)">
                    {{ $t('intafaced.academy.grant') }}
                  </Button>
                  <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.signInToGrant') }}</router-link>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.academy.emptyCerts') }}</div>
    </IxState>

    <div style="margin-top:16px;">
      <h3 class="ix-subhead">{{ $t('intafaced.academy.myCerts') }}</h3>
      <IxState compact :loading="mine.loading" :reason="mine.reason" :message="mine.message" endpoint="/api/academy/trpc/myCerts">
        <div v-if="mine.data && mine.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.academy.certId') }}</th>
                <th>{{ $t('intafaced.academy.grantedAt') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in mine.data" :key="row.certId">
                <td>{{ row.certId }}</td>
                <td>{{ row.grantedAt }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.academy.noGrants') }}</div>
      </IxState>
    </div>

    <div v-if="progress.reason" style="margin-top:14px;">
      <IxState compact :loading="progress.loading" :reason="progress.reason" :message="progress.message" endpoint="/api/academy/trpc/certProgress">
        <div v-if="progress.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.certTitle') }}</span>
            <span class="v">{{ progress.data.title }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.progress') }}</span>
            <span class="v">{{ progress.data.completedCount }} / {{ progress.data.requiredCount }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.complete') }}</span>
            <span class="v">{{ progress.data.complete ? $t('intafaced.academy.yes') : $t('intafaced.academy.no') }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.granted') }}</span>
            <span class="v">{{ progress.data.granted ? $t('intafaced.academy.yes') : $t('intafaced.academy.no') }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div v-if="grantAction.ran" style="margin-top:14px;">
      <div v-if="grantAction.reason === 'ok'" class="ix-done">
        <strong>{{ grantAction.data.alreadyGranted ? $t('intafaced.academy.alreadyGranted') : $t('intafaced.academy.granted') }}</strong>
        <div style="margin-top:6px;">{{ grantAction.data.grant && grantAction.data.grant.certId }}</div>
        <div v-if="grantAction.data.perks" style="margin-top:6px;">
          {{ $t('intafaced.academy.perks') }}: {{ grantAction.data.perks.status }}
          <span v-if="grantAction.data.perks.status === 'refuse'"> · {{ grantAction.data.perks.message }}</span>
          <span v-if="grantAction.data.perks.status === 'real'"> · {{ grantAction.data.perks.sot }}</span>
        </div>
      </div>
      <IxState compact v-else :loading="grantAction.busy" :reason="grantAction.reason" :message="grantAction.message" endpoint="/api/academy/trpc/grantCert"></IxState>
    </div>

    <div style="margin-top:16px;">
      <h3 class="ix-subhead">{{ $t("intafaced.academy['certs.enroll']") }}</h3>
      <p class="ix-lead">{{ $t("intafaced.academy['certs.enrollLead']") }}</p>
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button
          v-for="p in enrollPaths"
          :key="p"
          size="small"
          :type="enrollPath === p ? 'primary' : 'default'"
          @click="enrollPath = p"
        >{{ $t('intafaced.academy.paths.' + p) }}</Button>
      </div>
      <div class="ix-actions">
        <Button v-if="canWrite" type="primary" size="small" :loading="enrollAction.busy" @click="enroll(enrollPath)">
          {{ $t("intafaced.academy['certs.enrollSubmit']") }}
        </Button>
        <router-link v-else-if="!ixToken" to="/platform">{{ $t("intafaced.academy['certs.enrollSignIn']") }}</router-link>
      </div>
      <div v-if="enrollAction.ran" style="margin-top:14px;">
        <div v-if="enrollAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t("intafaced.academy['certs.enrolled']") }}</strong>
          <div style="margin-top:6px;">{{ enrollAction.data.pathSlug }}</div>
          <div v-if="enrollAction.data.enrolledAt" style="margin-top:6px;">
            {{ $t("intafaced.academy['certs.enrolledAt']") }}: {{ enrollAction.data.enrolledAt }}
          </div>
        </div>
        <IxState compact v-else :loading="enrollAction.busy" :reason="enrollAction.reason" :message="enrollAction.message" endpoint="/api/academy/trpc/enrollCertPath"></IxState>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * Cert grants on /academy — no perk money, no second book.
 *
 * Grant when the catalog says complete. A second grant returns alreadyGranted.
 * Perk readout is identity SoT or a named refuse.
 *
 * Enroll is a bookmark on one of four curriculum paths. Unknown slugs refuse
 * as academy.cert_invalid. certs is the title string in en.js; enroll copy
 * lives on dotted sibling keys so grant strings stay put.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import { query, mutate } from '../../../config/intafaced.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

var ENROLL_PATHS = ['foundations', 'markets', 'builder', 'sovereign'];

export default {
  name: 'IxAcademyCerts',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      selectedCertId: null,
      enrollPaths: ENROLL_PATHS,
      enrollPath: 'foundations',
      definitions: this.emptySection(),
      mine: this.emptySection(),
      progress: this.emptySection(),
      grantAction: this.emptyAction(),
      enrollAction: this.emptyAction()
    };
  },
  computed: {
    canWrite() {
      return !!this.ixToken;
    }
  },
  created() {
    this.load('definitions', query('academy', 'certDefinitions', undefined, this.ixToken));
    this.loadMine();
  },
  methods: {
    loadMine() {
      this.load('mine', query('academy', 'myCerts', undefined, this.ixToken));
    },
    grantBlocked(certId) {
      if (!this.progress.data || this.selectedCertId !== certId) return true;
      return !this.progress.data.complete;
    },
    openCert(certId) {
      this.selectedCertId = certId;
      this.load('progress', query('academy', 'certProgress', { certId: certId }, this.ixToken));
    },
    grant(certId) {
      var self = this;
      this.selectedCertId = certId;
      this.act('grantAction', mutate('academy', 'grantCert', { certId: certId }, this.ixToken)).then(function (res) {
        self.loadMine();
        self.load('progress', query('academy', 'certProgress', { certId: certId }, self.ixToken));
      });
    },
    enroll(pathSlug) {
      this.enrollPath = pathSlug;
      this.act('enrollAction', mutate('academy', 'enrollCertPath', { pathSlug: pathSlug }, this.ixToken));
    }
  }
};
</script>
