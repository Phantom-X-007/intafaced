<template>
  <div>
  <div class="ix-card">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.academy.curriculum') }}</h2>
      <span class="ix-sub">curriculum · markCurriculumComplete</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.academy.curriculumLead') }}</p>

    <div class="ix-actions" style="margin-bottom:16px;">
      <Button
        v-for="p in paths"
        :key="p"
        size="small"
        :type="path === p ? 'primary' : 'default'"
        @click="setPath(p)"
      >{{ $t('intafaced.academy.paths.' + p) }}</Button>
    </div>

    <IxState compact :loading="items.loading" :reason="items.reason" :message="items.message" endpoint="/api/academy/trpc/curriculum">
      <div v-if="playbooks.length" class="ix-scroll">
        <table class="ix-table">
          <thead>
            <tr>
              <th>{{ $t('intafaced.academy.playbook') }}</th>
              <th>{{ $t('intafaced.academy.kind') }}</th>
              <th>{{ $t('intafaced.academy.path') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in playbooks" :key="row.slug">
              <td>{{ row.title }}</td>
              <td>{{ row.kind }}</td>
              <td>{{ row.path }}</td>
              <td>
                <div class="ix-actions">
                  <Button size="small" :loading="itemDetail.loading && itemSlug === row.slug" @click="openItem(row.slug)">
                    {{ $t('intafaced.academy.open') }}
                  </Button>
                  <Button v-if="canWrite" type="primary" size="small" :loading="completeAction.busy && completeSlug === row.slug" @click="complete(row.slug)">
                    {{ $t('intafaced.academy.complete') }}
                  </Button>
                  <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.signInToComplete') }}</router-link>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.academy.emptyCurriculum') }}</div>
    </IxState>

    <div v-if="itemSlug" style="margin-top:14px;">
      <IxState compact :loading="itemDetail.loading" :reason="itemDetail.reason" :message="itemDetail.message" endpoint="/api/academy/trpc/curriculumItem">
        <div v-if="itemDetail.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.playbook') }}</span>
            <span class="v">{{ itemDetail.data.title }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.itemSlug') }}</span>
            <span class="v">{{ itemDetail.data.slug }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-field-grid" style="margin-top:16px;">
      <div class="ix-field">
        <label for="ix-academy-slug">{{ $t('intafaced.academy.itemSlug') }}</label>
        <Input element-id="ix-academy-slug" v-model="slugDraft" :placeholder="$t('intafaced.academy.itemSlugHint')"></Input>
      </div>
    </div>
    <div class="ix-actions">
      <Button size="small" :loading="itemDetail.loading" :disabled="!slugDraft" @click="openItem(slugDraft)">
        {{ $t('intafaced.academy.lookupSlug') }}
      </Button>
      <Button v-if="canWrite" size="small" :loading="completeAction.busy" :disabled="!slugDraft" @click="complete(slugDraft)">
        {{ $t('intafaced.academy.completeSlug') }}
      </Button>
    </div>

    <div v-if="completeAction.ran" style="margin-top:14px;">
      <div v-if="completeAction.reason === 'ok'" class="ix-done">
        <strong>{{ $t('intafaced.academy.completed') }}</strong>
        <div style="margin-top:6px;">{{ completeAction.data.itemSlug }}</div>
      </div>
      <IxState compact v-else :loading="completeAction.busy" :reason="completeAction.reason" :message="completeAction.message" endpoint="/api/academy/trpc/markCurriculumComplete"></IxState>
    </div>
  </div>

  <div class="ix-card">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.academy.residency') }}</h2>
      <span class="ix-sub">myResidencies · applyResidency · withdrawResidency</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.academy.residencyLead') }}</p>

    <h3 class="ix-subhead">{{ $t('intafaced.academy.residencyMine') }}</h3>
    <IxState compact :loading="mine.loading" :reason="mine.reason" :message="mine.message" endpoint="/api/academy/trpc/myResidencies">
      <div v-if="mine.data && mine.data.length" class="ix-scroll">
        <table class="ix-table">
          <thead>
            <tr>
              <th>{{ $t('intafaced.academy.residencyCohort') }}</th>
              <th>{{ $t('intafaced.academy.residencyStatus') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in mine.data" :key="row.id">
              <td>{{ row.cohortSlug }}</td>
              <td>{{ row.status }}</td>
              <td>
                <div class="ix-actions">
                  <Button
                    v-if="canWrite && row.status === 'applied'"
                    size="small"
                    :loading="withdrawAction.busy && withdrawId === row.id"
                    @click="withdrawResidency(row.id)"
                  >{{ $t('intafaced.academy.residencyWithdraw') }}</Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.academy.residencyEmpty') }}</div>
    </IxState>

    <div class="ix-field-grid" style="margin-top:16px;">
      <div class="ix-field">
        <label for="ix-academy-residency-cohort">{{ $t('intafaced.academy.residencyCohort') }}</label>
        <Input element-id="ix-academy-residency-cohort" v-model="cohortSlug" :placeholder="$t('intafaced.academy.residencyCohortHint')"></Input>
      </div>
      <div class="ix-field">
        <label for="ix-academy-residency-statement">{{ $t('intafaced.academy.residencyStatement') }}</label>
        <Input type="textarea" :rows="4" element-id="ix-academy-residency-statement" v-model="statement" :placeholder="$t('intafaced.academy.residencyStatementHint')"></Input>
      </div>
    </div>
    <div class="ix-actions">
      <Button v-if="canWrite" type="primary" size="small" :loading="applyAction.busy" :disabled="!cohortSlug || !statement" @click="applyResidency">
        {{ $t('intafaced.academy.residencyApply') }}
      </Button>
      <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.residencySignIn') }}</router-link>
    </div>

    <div v-if="applyAction.ran" style="margin-top:14px;">
      <div v-if="applyAction.reason === 'ok'" class="ix-done">
        <strong>{{ $t('intafaced.academy.residencyApplied') }}</strong>
        <div style="margin-top:6px;">{{ applyAction.data.id }} · {{ applyAction.data.cohortSlug }}</div>
      </div>
      <IxState compact v-else :loading="applyAction.busy" :reason="applyAction.reason" :message="applyAction.message" endpoint="/api/academy/trpc/applyResidency"></IxState>
    </div>

    <div v-if="withdrawAction.ran" style="margin-top:14px;">
      <div v-if="withdrawAction.reason === 'ok'" class="ix-done">
        <strong>{{ $t('intafaced.academy.residencyWithdrawn') }}</strong>
        <div style="margin-top:6px;">{{ withdrawAction.data.id }} · {{ withdrawAction.data.status }}</div>
      </div>
      <IxState compact v-else :loading="withdrawAction.busy" :reason="withdrawAction.reason" :message="withdrawAction.message" endpoint="/api/academy/trpc/withdrawResidency"></IxState>
    </div>
  </div>

  <div class="ix-card">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.academy.video') }}</h2>
      <span class="ix-sub">videos · videoPlayback · academy.video_storage_unconfigured</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.academy.videoLead') }}</p>

    <IxState compact :loading="videos.loading" :reason="videos.reason" :message="videos.message" endpoint="/api/academy/trpc/videos">
      <div v-if="videos.data && videos.data.length" class="ix-scroll">
        <table class="ix-table">
          <thead>
            <tr>
              <th>{{ $t('intafaced.academy.playbook') }}</th>
              <th>{{ $t('intafaced.academy.path') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in videos.data" :key="row.slug">
              <td>{{ row.title }}</td>
              <td>{{ row.path }}</td>
              <td>
                <div class="ix-actions">
                  <Button
                    v-if="canWrite"
                    type="primary"
                    size="small"
                    :loading="playback.loading && playSlug === row.slug"
                    @click="playVideo(row.slug)"
                  >{{ $t('intafaced.academy.videoPlay') }}</Button>
                  <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.videoSignIn') }}</router-link>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.academy.videoEmpty') }}</div>
    </IxState>

    <div v-if="playSlug" style="margin-top:14px;">
      <IxState compact :loading="playback.loading" :reason="playback.reason" :message="playback.message" endpoint="/api/academy/trpc/videoPlayback">
        <div v-if="playback.data" class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.videoGranted') }}</span>
            <span class="v">{{ playback.data.slug }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.videoExpires') }}</span>
            <span class="v">{{ playback.data.expiresAt }}</span>
          </div>
          <video
            v-if="playback.data.playbackUrl"
            :src="playback.data.playbackUrl"
            controls
            style="width:100%;margin-top:10px;background:#0b0b0b;"
          ></video>
        </div>
      </IxState>
    </div>
  </div>
  </div>
</template>

<script>
/**
 * Thin curriculum catalog on /academy — no new route.
 *
 * Paths are the four the catalog knows. Unknown slug is `academy.curriculum_not_found`.
 */
import IxState from '../../../components/intafaced/IxState.vue';
import { query, mutate } from '../../../config/intafaced.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

var PATHS = ['foundations', 'markets', 'builder', 'sovereign'];

export default {
  name: 'IxAcademyCurriculum',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      paths: PATHS,
      path: 'foundations',
      slugDraft: '',
      completeSlug: '',
      itemSlug: '',
      items: this.emptySection(),
      itemDetail: this.emptySection(),
      completeAction: this.emptyAction(),
      cohortSlug: '',
      statement: '',
      withdrawId: '',
      mine: this.emptySection(),
      applyAction: this.emptyAction(),
      withdrawAction: this.emptyAction(),
      playSlug: '',
      videos: this.emptySection(),
      playback: this.emptySection()
    };
  },
  computed: {
    canWrite() {
      return !!this.ixToken;
    },
    playbooks() {
      var rows = (this.items.data && this.items.data.length) ? this.items.data : [];
      return rows.filter(function (row) {
        return row.kind === 'playbook';
      });
    }
  },
  created() {
    this.loadPath();
    this.loadMine();
    this.loadVideos();
  },
  methods: {
    loadPath() {
      this.load('items', query('academy', 'curriculum', { path: this.path }, this.ixToken));
    },
    loadMine() {
      this.load('mine', query('academy', 'myResidencies', undefined, this.ixToken));
    },
    setPath(path) {
      this.path = path;
      this.loadPath();
    },
    openItem(slug) {
      this.itemSlug = slug;
      this.slugDraft = slug;
      this.load('itemDetail', query('academy', 'curriculumItem', { slug: slug }, this.ixToken));
    },
    complete(itemSlug) {
      this.completeSlug = itemSlug;
      this.act('completeAction', mutate('academy', 'markCurriculumComplete', { itemSlug: itemSlug }, this.ixToken));
    },
    applyResidency() {
      var self = this;
      this.act('applyAction', mutate('academy', 'applyResidency', { cohortSlug: this.cohortSlug, statement: this.statement }, this.ixToken)).then(function (res) {
        if (res && res.ok) self.loadMine();
      });
    },
    withdrawResidency(id) {
      var self = this;
      this.withdrawId = id;
      this.act('withdrawAction', mutate('academy', 'withdrawResidency', { id: id }, this.ixToken)).then(function (res) {
        if (res && res.ok) self.loadMine();
      });
    },
    loadVideos() {
      this.load('videos', query('academy', 'videos', undefined, this.ixToken));
    },
    playVideo(slug) {
      this.playSlug = slug;
      this.load('playback', query('academy', 'videoPlayback', { slug: slug }, this.ixToken));
    }
  }
};
</script>
