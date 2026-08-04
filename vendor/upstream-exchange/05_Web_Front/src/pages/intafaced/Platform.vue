<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.hub.title') }}</h1>
      <p>{{ $t('intafaced.hub.lead') }}</p>
      <div class="ix-source">{{ counts }}</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;" role="note">
      <strong>{{ $t('intafaced.hub.dualSessionTitle') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.hub.dualSessionLead') }}</div>
    </div>

    <!-- ── platform session ────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.hub.sessionTitle') }}</h2>
        <span class="ix-sub">POST /api/identity/trpc/auth.login</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.hub.sessionLead') }}
      </p>

      <div v-if="!session">
        <div class="ix-form-row">
          <Input v-model="identifier" :placeholder="$t('intafaced.hub.identifier')" @on-enter="signIn"></Input>
          <Input v-model="password" type="password" :placeholder="$t('intafaced.hub.password')" @on-enter="signIn"></Input>
          <div class="ix-form-action">
            <Button type="primary" :loading="signingIn" @click="signIn">{{ $t('intafaced.hub.signIn') }}</Button>
          </div>
        </div>
        <div v-if="signInError" class="ix-note" style="margin-top:14px;">
          <strong>{{ $t('intafaced.hub.signInFailed') }}</strong>
          <div style="margin-top:6px;">{{ signInError }}</div>
        </div>
        <div class="ix-note ix-note-quiet" style="margin-top:14px;">
          {{ $t('intafaced.hub.noSession') }}
        </div>
      </div>

      <div v-else>
        <div class="ix-kv">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.hub.signedInAs') }}</span>
            <span class="v" style="font-size:15px;">{{ identifier || '—' }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.hub.userId') }}</span>
            <span class="v" style="font-size:13px;">{{ userId || '—' }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.hub.expires') }}</span>
            <span class="v" style="font-size:15px;">{{ session.expiresAt }}</span>
          </div>
        </div>
        <div style="margin-top:16px;">
          <div style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ix-text-faint);margin-bottom:8px;">
            {{ $t('intafaced.hub.scopes') }}
          </div>
          <div class="ix-tags">
            <span v-for="s in scopes" :key="s" class="ix-tag ix-tag-on">{{ s }}</span>
          </div>
        </div>
        <div class="ix-note ix-note-quiet" style="margin-top:16px;">
          {{ $t('intafaced.hub.sessionMemoryOnly') }}
        </div>
        <div style="margin-top:16px;">
          <Button size="small" @click="signOut">{{ $t('intafaced.hub.signOut') }}</Button>
        </div>
      </div>
    </div>

    <!-- ── the modules ─────────────────────────────────────────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.hub.probeTitle') }}</h2>
        <span class="ix-sub">GET /api/&lt;module&gt;/trpc/health</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 8px;">
        {{ $t('intafaced.hub.probeLead') }}
      </p>
      <Button size="small" :loading="probing" @click="probe">{{ $t('intafaced.hub.probeRun') }}</Button>
    </div>

    <div class="ix-grid">
      <router-link v-for="m in modules" :key="m.key" :to="m.route" class="ix-tile">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
          <h3 style="margin:0;">{{ $t('intafaced.modules.' + m.key + '.title') }}</h3>
          <span class="ix-pill" :class="'ix-pill-' + m.state">{{ m.state }}</span>
        </div>
        <p>{{ $t('intafaced.modules.' + m.key + '.blurb') }}</p>
        <div class="ix-source" style="margin:0;">
          <span>{{ m.service }}</span>
          <span style="color:var(--ix-hairline-strong);">|</span>
          <span :style="{ color: probeColour(m) }">{{ probeLabel(m) }}</span>
        </div>
      </router-link>
    </div>

    <div class="ix-card" style="margin-top:22px;">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.hub.legendTitle') }}</h2>
      </div>
      <div style="display:grid;gap:10px;font-size:13.5px;line-height:1.6;color:var(--ix-text-dim);">
        <div><span class="ix-pill ix-pill-live">live</span> &nbsp;{{ $t('intafaced.hub.legendLive') }}</div>
        <div><span class="ix-pill ix-pill-partial">partial</span> &nbsp;{{ $t('intafaced.hub.legendPartial') }}</div>
        <div><span class="ix-pill ix-pill-absent">absent</span> &nbsp;{{ $t('intafaced.hub.legendAbsent') }}</div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * The platform hub.
 *
 * Two jobs, and the second one is the important one.
 *
 * 1. Hold the svc-identity session every other module screen needs. It is a
 *    second session next to the vendored exchange's own ucenter login, and the
 *    copy says so — the merge is an auth decision, not a UI one.
 *
 * 2. Tell the truth about what is reachable. Each tile carries a declared state
 *    from the manifest AND a live probe of the module's own `health` procedure,
 *    so a module that regresses (or that gets its router mounted) changes what
 *    this page says without anybody editing this page.
 */
import { MODULES, query, mutate, subjectOf, scopesOf } from '../../config/intafaced.js';

export default {
  name: 'IxPlatform',
  data() {
    return {
      modules: MODULES,
      identifier: '',
      password: '',
      signingIn: false,
      signInError: '',
      probing: false,
      // key -> { reason, status }
      probes: {}
    };
  },
  computed: {
    session() {
      return this.$store.getters.ixSession;
    },
    userId() {
      return subjectOf(this.$store.getters.ixToken);
    },
    scopes() {
      return scopesOf(this.$store.getters.ixToken);
    },
    counts() {
      var live = 0, partial = 0, absent = 0;
      this.modules.forEach(function(m) {
        if (m.state === 'live') live++;
        else if (m.state === 'partial') partial++;
        else absent++;
      });
      return this.$t('intafaced.hub.summary', { live: live, partial: partial, absent: absent });
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.probe();
  },
  methods: {
    signIn() {
      var self = this;
      if (!this.identifier || !this.password) return;
      this.signingIn = true;
      this.signInError = '';
      mutate('identity', 'auth.login', { identifier: this.identifier, password: this.password })
        .then(function(res) {
          self.signingIn = false;
          if (res.ok) {
            self.$store.commit('setIxSession', res.data);
            // The shell's chrome reads `member`, and this hub is a second door
            // into the same sign-in as pages/uc/Login.vue. Committing the same
            // projection here is what stops "signed in on /platform, signed out
            // in the header" — one session, one answer, whichever door was used.
            self.$store.commit('setMember', {
              id: res.data.userId || subjectOf(res.data.accessToken),
              username: self.identifier
            });
            self.password = '';
            self.probe();
          } else {
            self.signInError = res.message;
          }
        });
    },
    signOut() {
      this.$store.commit('clearIxSession');
      this.probe();
    },
    probe() {
      var self = this;
      this.probing = true;
      var token = this.$store.getters.ixToken;
      var pending = [];
      var next = {};

      this.modules.forEach(function(m) {
        if (!m.edge) {
          // No prefix at the edge at all. Nothing to probe — and saying
          // "unreachable" here would blame the network for a missing route.
          // (Indexer historically had no edge; on tip it does — this branch is
          // for true absences only.)
          next[m.key] = { reason: 'no_service' };
          return;
        }
        // edge may differ from key (chain → indexer, launch → protocol).
        pending.push(
          query(m.edge, 'health', undefined, token).then(function(res) {
            next[m.key] = {
              reason: res.ok ? 'ok' : res.reason,
              edge: m.edge
            };
          })
        );
      });

      Promise.all(pending).then(function() {
        self.probes = next;
        self.probing = false;
      });
    },
    probeLabel(m) {
      var p = this.probes[m.key];
      if (!p) return '…';
      if (p.reason === 'ok') return 'reachable';
      if (p.reason === 'no_service') return 'no service';
      if (p.reason === 'not_routed') return 'no route at the edge';
      if (p.reason === 'not_mounted') return 'router not mounted';
      return p.reason;
    },
    probeColour(m) {
      var p = this.probes[m.key];
      if (!p) return 'var(--ix-text-faint)';
      return p.reason === 'ok' ? 'var(--ix-up)' : 'var(--ix-orange)';
    }
  }
};
</script>
