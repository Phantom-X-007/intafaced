<template>
  <IxSocketPage
    class="notice-item-page"
    :title="$t('cms.noticeItem.title')"
    :lead="$t('cms.noticeItem.lead')"
    source="no service"
    :missing="$t('cms.noticeItem.missing')"
    :needs="needs"
  >
    <router-link to="/notice">
      <Button type="primary" size="small">{{ $t('cms.noticeItem.back') }}</Button>
    </router-link>
  </IxSocketPage>
</template>

<script>
/**
 * A SINGLE ANNOUNCEMENT — a §13 socket, for the same reason the list is one.
 *
 * `/announcement/:id` fetched `/uc/announcement/page` and `/uc/announcement/more`
 * from the Java CMS. No service behind our edge stores or serves an article, so
 * there is no content to fetch by id.
 *
 * This route is kept rather than removed because links to it exist — the shell's
 * own footer and header pointed here, and an announcement URL may have been
 * shared. A route that 404s into the catch-all home page would tell the reader
 * their link was wrong; this tells them the truth, which is that the platform
 * has no announcements.
 */
import IxSocketPage from '../../components/intafaced/IxSocketPage.vue';

export default {
  name: 'CmsNoticeItem',
  components: { IxSocketPage },
  computed: {
    needs() {
      return [
        this.$t('cms.noticeItem.need1'),
        this.$t('cms.noticeItem.need2')
      ];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-notice');
  }
};
</script>

<style scoped>
.notice-item-page {
  padding-top: 80px;
}
</style>
