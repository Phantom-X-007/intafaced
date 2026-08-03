<template>
  <div class="ix-note ix-nosurface" role="note">
    <div class="ix-nosurface-badge">{{ $t('intafaced.socket.badge') }}</div>

    <strong>{{ entry.capability }}</strong>

    <div class="ix-nosurface-block">
      <div class="ix-nosurface-h">{{ $t('intafaced.socket.missing') }}</div>
      <ul>
        <li v-for="(line, i) in entry.missing" :key="'m' + i">{{ line }}</li>
      </ul>
    </div>

    <div class="ix-nosurface-block">
      <div class="ix-nosurface-h">{{ $t('intafaced.socket.needed') }}</div>
      <ul>
        <li v-for="(line, i) in entry.needed" :key="'n' + i">{{ line }}</li>
      </ul>
    </div>

    <div class="ix-nosurface-foot">
      <div>
        <span class="ix-nosurface-k">{{ $t('intafaced.socket.tracker') }}</span>
        <code v-if="entry.tracker">{{ entry.tracker }}</code>
        <span v-else class="ix-nosurface-none">{{ $t('intafaced.socket.noTracker') }}</span>
      </div>
      <div>
        <span class="ix-nosurface-k">{{ $t('intafaced.socket.wasCalling') }}</span>
        <code>{{ entry.deadPath }}</code>
      </div>
      <p class="ix-nosurface-why">{{ $t('intafaced.socket.deadPathNote') }}</p>
    </div>
  </div>
</template>

<script>
/**
 * The §13 socket panel.
 *
 * Rendered by a screen whose capability does not exist behind svc-edge at all —
 * REASON.NO_SURFACE, the one failure the client never has to ask the network
 * about. No fetch happens here and none should: issuing a request to a path
 * nginx does not proxy is what produced the original hang.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not render an empty table, a zero,
 * a dash, a progress bar at 0%, or any other shape that a finished screen would
 * also produce with no rows in it. Those all read as "nothing has happened yet",
 * which is a claim about the data. The claim being made here is about the
 * platform, and it needs different furniture to land.
 *
 * The content is not written here — it comes from config/sockets.js, so the
 * screen and the registry cannot drift into disagreeing about what is missing.
 * Only the chrome is i18n-keyed; the socket facts are engineering statements
 * and live beside the client with the module manifest.
 */
import { socketByKey } from '../../config/sockets.js';
import { REASON } from '../../config/intafaced.js';

export default {
  name: 'IxNoSurface',
  props: {
    /** A key in config/sockets.js. */
    socketKey: { type: String, required: true }
  },
  computed: {
    /** The reason this panel represents. Exposed so a parent can branch on it. */
    reason() {
      return REASON.NO_SURFACE;
    },
    /**
     * The socket row.
     *
     * An unknown key is a wiring mistake, and it fails loudly rather than
     * rendering an empty panel that looks like a deliberate blank.
     */
    entry() {
      var row = socketByKey(this.socketKey);
      if (!row) {
        return {
          capability: this.socketKey,
          deadPath: '—',
          tracker: null,
          missing: [this.$t('intafaced.socket.unknownKey')],
          needed: []
        };
      }
      return row;
    }
  }
};
</script>

<style scoped>
/* Accent comes from the --ix-orange* tokens rather than a literal, so this
   panel follows the colour lock in assets/css/intafaced.css instead of pinning
   a hex the lock can move away from. The fallbacks mirror the tokens' current
   values (P21 deep neutral) and only apply if that sheet failed to load. */
.ix-nosurface {
  margin: 24px 0;
}
.ix-nosurface-badge {
  display: inline-block;
  font-size: 10.5px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  font-weight: 650;
  color: var(--ix-orange, #00c2a8);
  background: var(--ix-orange-soft, rgba(0, 194, 168, 0.12));
  border: 1px solid var(--ix-orange-glow, rgba(0, 194, 168, 0.28));
  border-radius: 3px;
  padding: 2px 8px;
  margin-bottom: 12px;
}
.ix-nosurface strong {
  display: block;
  font-size: 15px;
  margin-bottom: 4px;
}
.ix-nosurface-block {
  margin-top: 16px;
}
.ix-nosurface-h {
  font-size: 11px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--ix-text-faint, #8a8a8a);
  margin-bottom: 6px;
}
.ix-nosurface ul {
  margin: 0;
  padding-left: 18px;
  list-style: disc;
}
.ix-nosurface li {
  margin: 4px 0;
  line-height: 1.6;
}
.ix-nosurface-foot {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--ix-hairline, rgba(255, 255, 255, 0.08));
  font-size: 12.5px;
}
.ix-nosurface-foot > div {
  margin: 4px 0;
}
.ix-nosurface-k {
  color: var(--ix-text-faint, #8a8a8a);
  margin-right: 8px;
}
.ix-nosurface-none {
  color: var(--ix-text-faint, #8a8a8a);
  font-style: italic;
}
.ix-nosurface-why {
  margin: 10px 0 0;
  color: var(--ix-text-faint, #8a8a8a);
  line-height: 1.6;
}
</style>
