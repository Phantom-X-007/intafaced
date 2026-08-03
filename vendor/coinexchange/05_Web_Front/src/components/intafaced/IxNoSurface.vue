<template>
  <div
    class="ix-note ix-nosurface"
    :class="{ 'ix-nosurface-inline': inline }"
    role="note"
  >
    <div class="ix-nosurface-badge">{{ $t('intafaced.socket.badge') }}</div>

    <strong>{{ headline }}</strong>

    <router-link
      v-if="inline"
      class="ix-nosurface-more"
      :to="moreTo"
    >{{ $t('common.more') }}</router-link>

    <template v-if="!inline">
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
    </template>
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
 *
 * ── `inline`: THE SAME STATEMENT WHERE THERE IS ONE LINE OF ROOM ────────────
 *
 * Some sockets are not a page — the landing announcement strip is a single row
 * inside a navigation bar. The full panel cannot go there, and the alternative
 * that was actually shipped is worse than either: an empty red error toast, from
 * a caller parsing the SPA's own HTML as an API envelope (see the cms.announcements
 * row). A host with no room for the panel was silently choosing between hanging
 * and lying.
 *
 * `inline` renders the badge, one sentence, and a "more" link into the full
 * socket page. The sentence is `entry.strip` when the row defines one (same
 * claim as missing[0], shorter), otherwise the capability. Lists and footer
 * drop because they do not fit — not because they stopped applying. A screen
 * with room should use the full panel.
 *
 * ── `socketEntry`: AN INLINE ROW WITHOUT A REGISTRY KEY ─────────────────────
 *
 * The registry is the default. A host that already holds a SocketEntry (or a
 * one-off that is not worth a permanent key) may pass it as `socketEntry`.
 * Either `socketKey` or `socketEntry` is required; both set → entry wins.
 */
import { socketByKey } from '../../config/sockets.js';
import { REASON } from '../../config/intafaced.js';

export default {
  name: 'IxNoSurface',
  props: {
    /** A key in config/sockets.js. Required unless socketEntry is set. */
    socketKey: { type: String, default: null },
    /**
     * Inline SocketEntry. When set, used instead of registry lookup.
     * @type {import('../../config/sockets.js').SocketEntry|null}
     */
    socketEntry: { type: Object, default: null },
    /**
     * Compact one-line form for bars that cannot hold the full panel
     * (landing announcement strip).
     */
    inline: { type: Boolean, default: false },
    /** Destination for the inline "more" link. Default /notice (full §13). */
    moreTo: { type: String, default: '/notice' }
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
      if (this.socketEntry) {
        return this.socketEntry;
      }
      var row = this.socketKey ? socketByKey(this.socketKey) : null;
      if (!row) {
        return {
          capability: this.socketKey || '(no socket)',
          deadPath: '—',
          tracker: null,
          missing: [this.$t('intafaced.socket.unknownKey')],
          needed: []
        };
      }
      return row;
    },
    /**
     * One sentence for the reader. Inline prefers the strip line when present
     * so a 40px bar states the absence rather than the product name.
     */
    headline() {
      if (this.inline && this.entry.strip) {
        return this.entry.strip;
      }
      return this.entry.capability;
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

/* ── inline: one row for a strip that is ~40px tall ──────────────────────────
   Flex row: badge · sentence · more. Truncates the sentence rather than
   wrapping into a second line the host bar cannot hold. */
.ix-nosurface-inline {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  min-height: 0;
  background: transparent;
  border: 0;
}
.ix-nosurface-inline .ix-nosurface-badge {
  margin-bottom: 0;
  flex-shrink: 0;
}
.ix-nosurface-inline strong {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.ix-nosurface-more {
  flex-shrink: 0;
  font-size: 12.5px;
  color: var(--ix-orange, #00c2a8);
  text-decoration: none;
}
.ix-nosurface-more:hover {
  text-decoration: underline;
}
</style>
