<template>
  <div class="ix-card" data-academy-vr-client="socket.vr-client">
    <div class="ix-card-head">
      <h2>{{ $t('intafaced.academy.vr') }}</h2>
      <span class="ix-sub">socket.vr-client · WebXR</span>
    </div>
    <p class="ix-lead">{{ $t('intafaced.academy.vrLead') }}</p>
    <div class="ix-actions">
      <Button size="small" :loading="busy" :disabled="!sessionId || busy" @click="enterVr">
        {{ $t('intafaced.academy.vrEnter') }}
      </Button>
    </div>
    <div v-if="status === 'unavailable'" class="ix-note ix-note-quiet" style="margin-top:14px;">
      {{ $t('intafaced.academy.vrUnavailable') }}
      <span class="ix-sub">academy.vr_unavailable</span>
    </div>
    <div v-else-if="status === 'no-session'" class="ix-note ix-note-quiet" style="margin-top:14px;">
      {{ $t('intafaced.academy.vrNoSession') }}
    </div>
    <div v-if="status === 'active'" class="ix-note" style="margin-top:14px;">
      {{ $t('intafaced.academy.vrActive') }}
    </div>
    <canvas ref="xrCanvas" style="display:none;" aria-hidden="true"></canvas>
  </div>
</template>

<script>
/**
 * Academy WebXR adapter. Scene state remains owned by svc-academy and is
 * passed in from Canvas.vue; this component never creates a room or avatars.
 * WebXR absence is a named, honest refusal (`academy.vr_unavailable`).
 */
export default {
  name: 'IxAcademyVr',
  props: {
    sessionId: { type: String, default: '' },
    scene: { type: Object, default: null }
  },
  data() {
    return { busy: false, status: 'idle', xrSession: null };
  },
  beforeDestroy() {
    this.endVr();
  },
  methods: {
    async enterVr() {
      if (!this.sessionId) {
        this.status = 'no-session';
        return;
      }
      var xr = typeof navigator !== 'undefined' && navigator.xr;
      if (!xr || typeof xr.isSessionSupported !== 'function' || typeof xr.requestSession !== 'function') {
        this.status = 'unavailable';
        return;
      }
      this.busy = true;
      try {
        if (!(await xr.isSessionSupported('immersive-vr'))) {
          this.status = 'unavailable';
          return;
        }
        var session = await xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
        this.xrSession = session;
        this.status = 'active';
        session.addEventListener('end', this.onSessionEnd);
        await this.startFrameLoop(session);
      } catch (err) {
        this.status = 'unavailable';
      } finally {
        this.busy = false;
      }
    },
    async startFrameLoop(session) {
      var canvas = this.$refs.xrCanvas;
      var gl = canvas && canvas.getContext('webgl', { xrCompatible: true });
      if (!gl || typeof XRWebGLLayer === 'undefined') {
        await session.end();
        this.status = 'unavailable';
        return;
      }
      var referenceSpace = await session.requestReferenceSpace('local-floor');
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      var frame = function (_time, xrFrame) {
        if (!this.xrSession || this.xrSession !== session) return;
        var pose = xrFrame.getViewerPose(referenceSpace);
        if (pose) {
          gl.clearColor(0.035, 0.043, 0.07, 1);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        }
        session.requestAnimationFrame(frame);
      }.bind(this);
      session.requestAnimationFrame(frame);
    },
    onSessionEnd() {
      this.xrSession = null;
      this.status = 'idle';
    },
    endVr() {
      if (this.xrSession && typeof this.xrSession.end === 'function') {
        this.xrSession.end();
      }
      this.xrSession = null;
    }
  }
};
</script>
