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
        <span class="ix-sub">{{ $t("shellResidual.noService") }}</span>
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
                <th>{{ $t('cms.noticePage.markRead') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in items" :key="n.id">
                <td>{{ n.createdAt | dateFormat }}</td>
                <td>{{ n.kind }}</td>
                <td>{{ n.severity }}</td>
                <td><code>{{ n.titleKey }}</code></td>
                <td>{{ n.readAt ? $t('cms.noticePage.yes') : $t('cms.noticePage.no') }}</td>
                <td>
                  <Button v-if="!n.readAt" size="small" @click="markRead(n.id)">{{ $t('cms.noticePage.markRead') }}</Button>
                  <span v-else>{{ $t('cms.noticePage.unread') }}</span>
                </td>
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
      <div class="ix-actions">
        <span>{{ $t('cms.noticePage.unread') }}: {{ unreadCount }}</span>
        <Button size="small" @click="markAllRead">{{ $t('cms.noticePage.markAllRead') }}</Button>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('cms.noticePage.alertsTitle') }}</h2>
        <span class="ix-sub">{{ $t('cms.noticePage.alertsApi') }}</span>
      </div>
      <p class="ix-lead">{{ $t('cms.noticePage.alertsLead') }}</p>
      <div class="ix-form">
        <label>{{ $t('cms.noticePage.alertsKind') }}
          <select v-model="alertKind">
            <option value="funding">{{ $t('cms.noticePage.kindFunding') }}</option>
            <option value="liquidation_proximity">{{ $t('cms.noticePage.kindLiq') }}</option>
            <option value="price">{{ $t('cms.noticePage.kindPrice') }}</option>
          </select>
        </label>
        <label>{{ $t('cms.noticePage.alertsMarket') }}
          <Input v-model="alertMarketId" />
        </label>
        <label>{{ $t('cms.noticePage.alertsDirection') }}
          <select v-model="alertDirection">
            <option value="above">{{ $t('cms.noticePage.dirAbove') }}</option>
            <option value="below">{{ $t('cms.noticePage.dirBelow') }}</option>
          </select>
        </label>
        <label>{{ $t('cms.noticePage.alertsTarget') }}
          <Input v-model="alertTargetPrice" />
        </label>
        <Button type="primary" :loading="createAlertAction.busy" :disabled="!alertMarketId || !alertTargetPrice" @click="createAlert">{{ $t('cms.noticePage.alertsCreate') }}</Button>
      </div>
      <IxState
        v-if="createAlertAction.ran"
        :loading="createAlertAction.busy"
        :reason="createAlertAction.reason"
        :message="createAlertAction.message"
        endpoint="/api/notify/trpc/notify.createAlert"
      >
        <div v-if="createAlertAction.data && createAlertAction.data.alert" class="ix-note">
          {{ createAlertAction.data.alert.kind }} · {{ createAlertAction.data.alert.marketId }} · {{ createAlertAction.data.alert.direction }} · {{ createAlertAction.data.alert.targetPrice }} · {{ createAlertAction.data.alert.status }}
        </div>
        <div v-if="createAlertAction.data && createAlertAction.data.evaluation && createAlertAction.data.evaluation.canFire === false" class="ix-note">
          {{ $t('cms.noticePage.alertsCannotFire') }}
          <code>{{ createAlertAction.data.evaluation.code }}</code>
        </div>
      </IxState>
      <IxState :loading="alerts.loading" :reason="alerts.reason" :message="alerts.message" endpoint="/api/notify/trpc/notify.alerts">
        <div v-if="alertEvaluation && alertEvaluation.canFire === false" class="ix-note">
          {{ $t('cms.noticePage.alertsCannotFire') }}
          <code>{{ alertEvaluation.code }}</code>
        </div>
        <div v-if="alertRows.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('cms.noticePage.alertsKind') }}</th>
                <th>{{ $t('cms.noticePage.alertsMarket') }}</th>
                <th>{{ $t('cms.noticePage.alertsDirection') }}</th>
                <th>{{ $t('cms.noticePage.alertsTarget') }}</th>
                <th>{{ $t('cms.noticePage.kind') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in alertRows" :key="row.id">
                <td>{{ row.kind }}</td>
                <td>{{ row.marketId }}</td>
                <td>{{ row.direction }}</td>
                <td>{{ row.targetPrice }}</td>
                <td>{{ row.status }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('cms.noticePage.alertsEmpty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('cms.noticePage.channels') }}</h2>
        <span class="ix-sub">notify.channels</span>
      </div>
      <IxState :loading="channels.loading" :reason="channels.reason" :message="channels.message" endpoint="/api/notify/trpc/notify.channels">
        <div v-if="channelRows.length" class="ix-channel-list">
          <div v-for="channel in channelRows" :key="channel.channel" class="ix-channel-row">
            <strong>{{ channel.channel }}</strong>
            <span>{{ channel.available ? $t('cms.noticePage.channelAvailable') : $t('cms.noticePage.channelNotConfigured') }}</span>
            <code v-if="channel.requires && channel.requires.length">{{ channel.requires.join(', ') }}</code>
          </div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('cms.noticePage.channelsEmpty') }}</div>
      </IxState>
      <IxState v-if="items.length" :loading="deliveries.loading" :reason="deliveries.reason" :message="deliveries.message" endpoint="/api/notify/trpc/notify.deliveries">
        <div v-if="deliveryRows.length" class="ix-channel-list">
          <p class="ix-lead">{{ $t('cms.noticePage.deliveryLead') }}</p>
          <div v-for="delivery in deliveryRows" :key="delivery.id" class="ix-channel-row">
            <strong>{{ delivery.channel }}</strong>
            <span>{{ delivery.status }}</span>
            <span>{{ $t('cms.noticePage.attempts') }}: {{ delivery.attempts }}</span>
          </div>
        </div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('cms.noticePage.targetTitle') }}</h2>
        <span class="ix-sub">notify.registerTarget</span>
      </div>
      <p class="ix-lead">{{ $t('cms.noticePage.targetLead') }}</p>
      <div class="ix-form">
        <label>{{ $t('cms.noticePage.targetChannel') }}
          <select v-model="targetChannel">
            <option value="email">email</option>
            <option value="push">push</option>
            <option value="sms">sms</option>
          </select>
        </label>
        <label>{{ $t('cms.noticePage.targetAddress') }}
          <Input v-model="targetAddress" />
        </label>
        <Button type="primary" :loading="registerAction.busy" :disabled="!targetAddress" @click="registerTarget">{{ $t('cms.noticePage.targetRegister') }}</Button>
      </div>
      <IxState
        v-if="registerAction.ran"
        :loading="registerAction.busy"
        :reason="registerAction.reason"
        :message="registerAction.message"
        endpoint="/api/notify/trpc/notify.registerTarget"
      >
        <div v-if="registerAction.data && registerAction.data.status === 'sent'" class="ix-note">
          {{ $t('cms.noticePage.targetSent') }}
        </div>
        <div v-else-if="registerAction.data && registerAction.data.status === 'refused'" class="ix-note">
          {{ $t('cms.noticePage.targetRefused') }}
          <code>{{ registerAction.data.code }}</code>
        </div>
        <div v-else-if="registerAction.data && registerAction.data.status === 'failed'" class="ix-note">
          {{ $t('cms.noticePage.targetFailed') }}
        </div>
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
import { query, mutate } from '../../config/intafaced.js';

export default {
  name: 'CmsNotice',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      inbox: this.emptySection(),
      unread: this.emptySection(),
      channels: this.emptySection(),
      deliveries: this.emptySection(),
      markReadAction: this.emptyAction(),
      markAllReadAction: this.emptyAction(),
      targetChannel: 'email',
      targetAddress: '',
      registerAction: this.emptyAction(),
      alerts: this.emptySection(),
      createAlertAction: this.emptyAction(),
      alertKind: 'funding',
      alertMarketId: '',
      alertDirection: 'above',
      alertTargetPrice: ''
    };
  },
  computed: {
    items() {
      return (this.inbox.data && this.inbox.data.items) || [];
    },
    unreadCount() {
      return this.unread.data && this.unread.data.count !== undefined ? String(this.unread.data.count) : '—';
    },
    channelRows() {
      var data = this.channels.data;
      return Array.isArray(data) ? data : (data && data.channels) || [];
    },
    deliveryRows() {
      return Array.isArray(this.deliveries.data) ? this.deliveries.data : [];
    },
    alertRows() {
      return (this.alerts.data && this.alerts.data.items) || [];
    },
    alertEvaluation() {
      return this.alerts.data && this.alerts.data.evaluation ? this.alerts.data.evaluation : null;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-notice');
    this.$store.state.HeaderActiveName = '1-1';
    this.load('inbox', query('notify', 'notify.list', { limit: 50 }, this.ixToken)).then(() => {
      if (this.items.length) this.load('deliveries', query('notify', 'notify.deliveries', { notificationId: this.items[0].id }, this.ixToken));
    });
    this.load('unread', query('notify', 'notify.unreadCount', undefined, this.ixToken));
    this.load('channels', query('notify', 'notify.channels', undefined, this.ixToken));
    this.load('alerts', query('notify', 'notify.alerts', undefined, this.ixToken));
  },
  methods: {
    refreshInbox() {
      this.load('inbox', query('notify', 'notify.list', { limit: 50 }, this.ixToken)).then(() => {
        if (this.items.length) this.load('deliveries', query('notify', 'notify.deliveries', { notificationId: this.items[0].id }, this.ixToken));
      });
      this.load('unread', query('notify', 'notify.unreadCount', undefined, this.ixToken));
    },
    markRead(id) {
      this.act('markReadAction', mutate('notify', 'notify.markRead', { ids: [id] }, this.ixToken)).then((res) => {
        if (res.ok) this.refreshInbox();
      });
    },
    markAllRead() {
      this.act('markAllReadAction', mutate('notify', 'notify.markAllRead', undefined, this.ixToken)).then((res) => {
        if (res.ok) this.refreshInbox();
      });
    },
    registerTarget() {
      if (!this.targetAddress || this.registerAction.busy) return;
      var payload = { channel: this.targetChannel, address: this.targetAddress };
      if (this.$i18n && this.$i18n.locale) payload.locale = this.$i18n.locale;
      this.act('registerAction', mutate('notify', 'notify.registerTarget', payload, this.ixToken));
    },
    createAlert() {
      if (!this.alertMarketId || !this.alertTargetPrice || this.createAlertAction.busy) return;
      var payload = {
        kind: this.alertKind,
        marketId: this.alertMarketId,
        direction: this.alertDirection,
        targetPrice: this.alertTargetPrice
      };
      this.act('createAlertAction', mutate('notify', 'notify.createAlert', payload, this.ixToken)).then((res) => {
        if (res.ok) this.load('alerts', query('notify', 'notify.alerts', undefined, this.ixToken));
      });
    }
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
.ix-actions { display:flex; gap:12px; align-items:center; margin-top:12px; }
.ix-channel-list { display:grid; gap:8px; }
.ix-channel-row { display:flex; gap:12px; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.06); }
.ix-channel-row code { color:var(--ix-text-faint, #6b7280); }
</style>
