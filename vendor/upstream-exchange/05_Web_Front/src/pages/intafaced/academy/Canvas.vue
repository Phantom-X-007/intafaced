<template>
  <div class="ix-card">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.academy.canvas') }}</h2>
      <span class="ix-sub">session · updateScene</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.academy.canvasLead') }}</p>

    <div class="ix-field-grid">
      <div class="ix-field">
        <label for="ix-academy-session">{{ $t('intafaced.academy.sessionId') }}</label>
        <Input element-id="ix-academy-session" v-model="sessionId" :placeholder="$t('intafaced.academy.sessionIdHint')"></Input>
      </div>
    </div>
    <div class="ix-actions" style="margin-bottom:16px;">
      <Button size="small" :loading="session.loading" :disabled="!sessionId" @click="reload">
        {{ $t('intafaced.academy.loadSession') }}
      </Button>
    </div>

    <IxState :loading="session.loading" :reason="session.reason" :message="session.message" endpoint="/api/academy/trpc/session">
      <div v-if="session.data && session.data.session">
        <div class="ix-kv" style="margin-bottom:16px;">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.sessionTitle') }}</span>
            <span class="v">{{ session.data.session.title }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.status') }}</span>
            <span class="v">{{ session.data.session.status }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.fingerprint') }}</span>
            <span class="v">{{ fingerprint }}</span>
          </div>
        </div>
        <p class="ix-lead">{{ $t('intafaced.academy.canvasHint') }}</p>
        <div class="ix-note" style="position:relative;height:360px;cursor:crosshair;overflow:hidden;" @click="moveHost">
          <div
            v-for="av in avatars"
            :key="av.id"
            :style="{ position: 'absolute', left: av.position.x + 'px', top: av.position.y + 'px', width: '12px', height: '12px', background: 'var(--ix-orange, #ff8a1f)', borderRadius: '50%' }"
          ></div>
        </div>
      </div>
    </IxState>

    <div v-if="sceneAction.ran" style="margin-top:14px;">
      <div v-if="sceneAction.reason === 'ok'" class="ix-done">
        <strong>{{ $t('intafaced.academy.sceneUpdated') }}</strong>
        <div style="margin-top:6px;">{{ sceneAction.data.sceneFingerprint }}</div>
      </div>
      <IxState v-else :loading="sceneAction.busy" :reason="sceneAction.reason" :message="sceneAction.message" endpoint="/api/academy/trpc/updateScene"></IxState>
    </div>
  </div>
</template>

<script>
/**
 * Spatial scene v1 on /academy. Host writes the whole scene; attendees read.
 *
 * No schema v2. Scene lives on the service only. expectedFingerprint is the last server hash.
 * Attendee writes refuse by name (`academy.not_host`).
 */
import IxState from '../../../components/intafaced/IxState.vue';
import { query, mutate } from '../../../config/intafaced.js';
import ixModule from '../../../components/intafaced/module-mixin.js';

export default {
  name: 'IxAcademyCanvas',
  components: { IxState },
  mixins: [ixModule],
  props: {
    sessionIdFromHub: { type: String, default: '' }
  },
  data() {
    return {
      sessionId: '',
      session: this.emptySection(),
      sceneAction: this.emptyAction()
    };
  },
  computed: {
    fingerprint() {
      var s = this.session.data && this.session.data.session;
      return (s && s.sceneFingerprint) || '';
    },
    avatars() {
      var s = this.session.data && this.session.data.session;
      var scene = s && s.scene;
      return (scene && scene.avatars) || [];
    }
  },
  watch: {
    sessionIdFromHub: function (id) {
      if (id && id !== this.sessionId) {
        this.sessionId = id;
        this.reload();
      }
    }
  },
  methods: {
    reload() {
      if (!this.sessionId) return;
      this.load('session', query('academy', 'session', { sessionId: this.sessionId }, this.ixToken));
    },
    moveHost(ev) {
      var self = this;
      var s = this.session.data && this.session.data.session;
      if (!s || !this.ixToken) return;
      var scene = {
        version: 1,
        stage: { width: 640, height: 360 },
        avatars: [
          {
            id: 'host',
            participantId: 'host',
            position: { x: ev.offsetX, y: ev.offsetY }
          }
        ]
      };
      this.act(
        'sceneAction',
        mutate('academy', 'updateScene', { sessionId: this.sessionId, scene: scene, expectedFingerprint: s.sceneFingerprint }, this.ixToken)
      ).then(function (res) {
        if (res.ok) self.reload();
      });
    }
  }
};
</script>
