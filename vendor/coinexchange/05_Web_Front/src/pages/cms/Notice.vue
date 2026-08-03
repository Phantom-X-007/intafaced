<template>
  <div class="ix-page notice-page">
    <div class="ix-page-head">
      <h1>{{ $t('cms.noticePage.title') }}</h1>
      <p>{{ $t('cms.noticePage.lead') }}</p>
    </div>

    <!-- ── platform announcements: nothing serves them ──────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('cms.noticePage.announcements') }}</h2>
        <span class="ix-sub">no service</span>
      </div>
      <IxState reason="no_surface" :message="$t('cms.noticePage.announcementsMissing')" />
    </div>

    <!-- ── the personal inbox: this one is real ─────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('cms.noticePage.inbox') }}</h2>
        <span class="ix-sub">notify.list</span>
      </div>
      <p class="ix-lead">{{ $t('cms.noticePage.inboxLead') }}</p>

      <IxState
        :loading="inbox.loading"
        :reason="inbox.reason"
        :message="inbox.message"
        endpoint="/api/notify/trpc/notify.list"
      >
        <div v-if="items.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('cms.noticePage.when') }}</th>
                <th>{{ $t('cms.noticePage.kind') }}</th>
                <th>{{ $t('cms.noticePage.severity') }}</th>
                <th>{{ $t('cms.noticePage.messageKey') }}</th>
                <th>{{ $t('cms.noticePage.read') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in items" :key="n.id">
                <td>{{ n.createdAt | dateFormat }}</td>
                <td>{{ n.kind }}</td>
                <td>{{ n.severity }}</td>
                <td><code>{{ n.titleKey }}</code></td>
                <td>{{ n.readAt ? $t('cms.noticePage.yes') : $t('cms.noticePage.no') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('cms.noticePage.inboxEmpty') }}</div>

        <!--
          WHY A KEY AND NOT A SENTENCE.

          svc-notify stores `titleKey` / `bodyKey` — i18n keys — plus `params`,
          and deliberately never a rendered sentence (its own comment on
          `refusalCode` says as much: "a code, never a sentence — the client
          renders copy from @intafaced/i18n"). This shell is not in the pnpm
          workspace and cannot import that catalogue, so it does not hold the
          copy these keys resolve to.

          The key is therefore shown verbatim. The alternative was to guess a
          human sentence from the key name, which would be inventing the content
          of a message the platform sent to this user — the exact failure the
          honesty rules exist to prevent, and worse here than elsewhere because a
          notification is a claim about something that happened to their money.
        -->
        <p class="ix-cap-note">{{ $t('cms.noticePage.keysNote') }}</p>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * ANNOUNCEMENTS — a §13 socket, next to the one adjacent surface that is real.
 *
 * The vendor's `/uc/announcement/page` served operator-authored posts from the
 * Java CMS. Nothing behind our edge authors, stores or serves broadcast content:
 * there is no CMS service, and no procedure on any service returns an article.
 *
 * svc-notify is close enough to be worth being precise about. It carries a
 * per-user inbox — `notify.list`, cursor-paginated, scoped `notify:read` — and
 * that is a real, live read. But an inbox is not an announcement board: the
 * inbox is addressed to one user and written by services, the board is addressed
 * to everyone and written by an operator. Rendering the inbox under the heading
 * "Announcements" would have been the tidier-looking lie, so the two are shown
 * as two things, each labelled as what it is.
 */
import IxState from '../../components/intafaced/IxState.vue';
import ixModule from '../../components/intafaced/module-mixin.js';
import { query } from '../../config/intafaced.js';

export default {
  name: 'CmsNotice',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      inbox: this.emptySection()
    };
  },
  computed: {
    items() {
      return (this.inbox.data && this.inbox.data.items) || [];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-notice');
    this.$store.state.HeaderActiveName = '1-1';
    this.load('inbox', query('notify', 'notify.list', { limit: 50 }, this.ixToken));
  }
};
</script>

<style scoped>
.notice-page {
  padding-top: 80px;
}
.ix-lead {
  color: var(--ix-text-dim, #8a909c);
  font-size: 13.5px;
  line-height: 1.6;
  margin: 0 0 16px;
}
.ix-cap-note {
  margin: 12px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--ix-orange, #ff8a1f);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--ix-text-faint, #6b7280);
}
</style>
