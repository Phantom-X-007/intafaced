<template>
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

    <IxState :loading="items.loading" :reason="items.reason" :message="items.message" endpoint="/api/academy/trpc/curriculum">
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
      <IxState :loading="itemDetail.loading" :reason="itemDetail.reason" :message="itemDetail.message" endpoint="/api/academy/trpc/curriculumItem">
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
      <IxState v-else :loading="completeAction.busy" :reason="completeAction.reason" :message="completeAction.message" endpoint="/api/academy/trpc/markCurriculumComplete"></IxState>
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
      completeAction: this.emptyAction()
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
  },
  methods: {
    loadPath() {
      this.load('items', query('academy', 'curriculum', { path: this.path }, this.ixToken));
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
    }
  }
};
</script>
