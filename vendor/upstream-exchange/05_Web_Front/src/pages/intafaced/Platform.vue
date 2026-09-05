<template>
  <div class="ix-page money-platform">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.hub.title') }}</h1>
      <p>{{ $t('intafaced.hub.lead') }}</p>
      <div class="ix-source">{{ counts }}</div>
    </div>

    <div class="ix-note ix-note-quiet money-platform-note" role="note">
      Platform and venue sessions are separate.
    </div>

    <!-- ── platform session ────────────────────────────────────────────── -->
    <div class="ix-card money-platform-session">
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

    <!-- ── API keys — one plane in front of trade and pay ─────────────── -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.api.title') }}</h2>
        <span class="ix-sub">POST /api/identity/trpc/apiKeys.create</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.api.lead') }}
      </p>

      <div class="ix-form-row">
        <Input v-model="keyName" :placeholder="$t('intafaced.api.name')" @on-enter="mintKey"></Input>
        <div class="ix-form-action">
          <Button type="primary" :loading="minting" @click="mintKey">{{ $t('intafaced.api.mint') }}</Button>
        </div>
      </div>

      <div style="margin-top:14px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ix-text-dim);cursor:pointer;">
          <input type="checkbox" v-model="keySandbox">
          <span>{{ $t('intafaced.api.sandboxHint') }}</span>
        </label>
      </div>
      <div class="ix-tags" style="margin-top:12px;">
        <span class="ix-tag" :class="{ 'ix-tag-on': keyTradeRead }" @click="keyTradeRead = !keyTradeRead" style="cursor:pointer;">trade:read</span>
        <span class="ix-tag" :class="{ 'ix-tag-on': keyPayRead }" @click="keyPayRead = !keyPayRead" style="cursor:pointer;">pay:read</span>
      </div>

      <div v-if="mintedKey" class="ix-note" style="margin-top:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <strong>{{ $t('intafaced.api.shownOnce') }}</strong>
          <span class="ix-pill" :class="mintedMode === 'sandbox' ? 'ix-pill-partial' : 'ix-pill-live'">{{ mintedMode === 'sandbox' ? $t('intafaced.api.sandbox') : $t('intafaced.api.live') }}</span>
        </div>
        <code style="word-break:break-all;">{{ mintedKey }}</code>
      </div>

      <IxState
        v-if="mintRan && !mintedKey"
        :loading="minting"
        :reason="mintReason"
        :message="mintMessage"
        endpoint="/api/identity/trpc/apiKeys.create"
      ></IxState>

      <div v-if="listedKeys.length" style="margin-top:16px;">
        <div style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ix-text-faint);margin-bottom:8px;">
          {{ $t('intafaced.api.mode') }}
        </div>
        <div v-for="k in listedKeys" :key="k.id" class="ix-kv" style="margin-bottom:8px;">
          <div class="ix-kv-item">
            <span class="k">{{ k.name }}</span>
            <span class="v">{{ k.prefix }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.api.mode') }}</span>
            <span class="v">
              <span class="ix-pill" :class="k.mode === 'sandbox' ? 'ix-pill-partial' : 'ix-pill-live'">{{ k.mode === 'sandbox' ? $t('intafaced.api.sandbox') : $t('intafaced.api.live') }}</span>
            </span>
          </div>
        </div>
      </div>

      <div v-if="mintedKey" style="margin-top:16px;">
        <Button size="small" :loading="probingDoors" @click="probeDoors">{{ $t('intafaced.api.probe') }}</Button>
        <div class="ix-grid" style="margin-top:14px;">
          <div>
            <div style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ix-text-faint);margin-bottom:8px;">
              {{ $t('intafaced.api.tradeDoor') }}
            </div>
            <IxState :loading="probingDoors" :reason="tradeProbe.reason" :message="tradeProbe.message" endpoint="/api/v1/markets">
              <div class="ix-note ix-note-quiet">{{ tradeProbe.message || $t('intafaced.api.tradePath') }}</div>
            </IxState>
          </div>
          <div>
            <div style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--ix-text-faint);margin-bottom:8px;">
              {{ $t('intafaced.api.payDoor') }}
            </div>
            <IxState :loading="probingDoors" :reason="payProbe.reason" :message="payProbe.message" endpoint="/api/pay/trpc/health">
              <div class="ix-note ix-note-quiet">{{ payProbe.message || $t('intafaced.api.payPath') }}</div>
            </IxState>
          </div>
        </div>
      </div>
    </div>

    <!-- ── embeddable ramp widget — iframe of /bank/ramps + pay checkout ─ -->
    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.infra.title') }}</h2>
        <span class="ix-sub">GET /api/widget/ramp</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.infra.lead') }}
      </p>
      <p class="ix-lead">{{ $t('intafaced.infra.snippetLead') }}</p>
      <textarea
        readonly
        aria-label="Embeddable ramp HTML"
        :value="embedSnippet"
        rows="4"
        style="width:100%;box-sizing:border-box;background:#000;color:var(--ix-orange);border:1px solid var(--ix-hairline);padding:12px;font:12px/1.5 ui-monospace,Menlo,monospace;"
      ></textarea>
      <div style="margin-top:16px;">
        <Button size="small" @click="copyEmbed">{{ $t('intafaced.infra.copy') }}</Button>
      </div>
      <div v-if="embedCopied" class="ix-note ix-note-quiet" style="margin-top:14px;">
        {{ $t('intafaced.infra.copied') }}
      </div>

      <div style="margin-top:16px;">
        <IxState
          :loading="widget.loading"
          :reason="widget.reason"
          :message="widget.message"
          endpoint="/api/widget/ramp"
        >
          <iframe
            class="ix-embed-preview"
            src="/api/widget/ramp"
            :title="$t('intafaced.infra.previewTitle')"
            width="420"
            height="320"
            style="border:0;background:#000;width:100%;max-width:420px;"
          ></iframe>
        </IxState>
      </div>

      <IxState
        :loading="programme.loading"
        :reason="programme.reason"
        :message="programme.message"
        endpoint="/api/bank/trpc/ramps.programme"
      >
        <div v-if="programme.data" class="ix-note ix-note-quiet" style="margin-top:14px;">
          {{ programme.data.displayName }}
        </div>
      </IxState>
    </div>

    <!-- ── register ────────────────────────────────────────────────────── -->
    <div v-if="!session" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.hub.registerTitle') }}</h2>
        <span class="ix-sub">POST /api/identity/trpc/auth.register</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.hub.registerLead') }}
      </p>
      <div class="ix-form-row">
        <Input v-model="registerHandle" :placeholder="$t('intafaced.hub.registerHandle')" @on-enter="register"></Input>
        <Input v-model="registerEmail" :placeholder="$t('intafaced.hub.registerEmail')" @on-enter="register"></Input>
        <Input v-model="registerPassword" type="password" :placeholder="$t('intafaced.hub.registerPassword')" @on-enter="register"></Input>
        <div class="ix-form-action">
          <Button type="primary" :loading="registering" @click="register">{{ $t('intafaced.hub.register') }}</Button>
        </div>
      </div>
      <IxState
        v-if="registerRan"
        :loading="registering"
        :reason="registerReason"
        :message="registerMessage"
        endpoint="/api/identity/trpc/auth.register"
      ></IxState>
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
import { MODULES, query, mutate, rest, subjectOf, scopesOf } from '../../config/intafaced.js';
import IxState from '../../components/intafaced/IxState.vue';
import ixModule from '../../components/intafaced/module-mixin.js';

/** Mirrors svc-identity auth.register handle rule. */
var HANDLE_RE = /^[a-zA-Z0-9_]{3,32}$/;
/** Permissive; the service's email check is the real one. */
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var PASSWORD_MIN = 12;

export default {
  name: 'IxPlatform',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      modules: MODULES,
      identifier: '',
      password: '',
      signingIn: false,
      signInError: '',
      registerHandle: '',
      registerEmail: '',
      registerPassword: '',
      registering: false,
      registerRan: false,
      registerReason: null,
      registerMessage: '',
      probing: false,
      // key -> { reason, status }
      probes: {},
      keyName: 'bot',
      keySandbox: true,
      keyTradeRead: true,
      keyPayRead: false,
      minting: false,
      mintRan: false,
      mintReason: null,
      mintMessage: '',
      mintedKey: '',
      mintedMode: '',
      listedKeys: [],
      probingDoors: false,
      tradeProbe: { reason: null, message: '' },
      payProbe: { reason: null, message: '' },
      embedCopied: false,
      widget: this.emptySection(),
      programme: this.emptySection()
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
    },
    ixToken() {
      return this.$store.getters.ixToken;
    },
    embedSnippet() {
      var origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      return '<iframe src="' + origin + '/api/widget/ramp" title="INTAFACED ramp" width="420" height="720" style="border:0;background:#000"></iframe>';
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.probe();
    this.loadKeys();
    this.probeWidget();
    this.load('programme', query('bank', 'ramps.programme', undefined, this.ixToken));
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
            self.loadKeys();
          } else {
            self.signInError = res.message;
          }
        });
    },
    register() {
      var self = this;
      var handle = (this.registerHandle || '').trim();
      var email = (this.registerEmail || '').trim();
      var password = this.registerPassword || '';
      if (!handle || !email || !password) return;

      this.registerRan = true;
      this.registering = false;
      this.registerReason = null;
      this.registerMessage = '';

      if (!HANDLE_RE.test(handle)) {
        this.registerReason = 'error';
        this.registerMessage = this.$t('intafaced.hub.registerHandleInvalid');
        return;
      }
      if (!EMAIL_RE.test(email)) {
        this.registerReason = 'error';
        this.registerMessage = this.$t('intafaced.hub.registerEmailInvalid');
        return;
      }
      if (password.length < PASSWORD_MIN) {
        this.registerReason = 'error';
        this.registerMessage = this.$t('intafaced.hub.registerPasswordShort');
        return;
      }

      this.registering = true;
      mutate('identity', 'auth.register', { handle: handle, email: email, password: password })
        .then(function(res) {
          self.registering = false;
          if (res.ok) {
            self.$store.commit('setIxSession', res.data);
            self.$store.commit('setMember', {
              id: res.data.userId || subjectOf(res.data.accessToken),
              username: handle
            });
            self.registerPassword = '';
            self.registerReason = 'ok';
            self.registerMessage = '';
            self.probe();
            self.loadKeys();
          } else {
            self.registerReason = res.reason;
            self.registerMessage = res.message;
          }
        });
    },
    signOut() {
      var session = this.session;
      var refreshToken = session && session.refreshToken;
      this.$store.commit('clearIxSession');
      this.listedKeys = [];
      this.mintedKey = '';
      this.mintedMode = '';
      this.probe();
      if (refreshToken) {
        mutate('identity', 'auth.logout', { refreshToken: refreshToken });
      }
    },
    mintKey() {
      var self = this;
      var scopes = [];
      if (this.keyTradeRead) scopes.push('trade:read');
      if (this.keyPayRead) scopes.push('pay:read');
      if (!this.keyName || !scopes.length) return;

      this.mintRan = true;
      this.minting = true;
      this.mintReason = null;
      this.mintMessage = '';
      this.mintedKey = '';
      this.mintedMode = '';

      mutate('identity', 'apiKeys.create', {
        name: this.keyName,
        scopes: scopes,
        mode: this.keySandbox ? 'sandbox' : 'live'
      }, this.ixToken).then(function(res) {
        self.minting = false;
        if (res.ok && res.data && res.data.key) {
          self.mintReason = 'ok';
          self.mintedKey = res.data.key;
          self.mintedMode = res.data.mode || (self.keySandbox ? 'sandbox' : 'live');
          self.loadKeys();
          self.probeDoors();
        } else {
          self.mintReason = res.reason;
          self.mintMessage = res.message;
        }
      });
    },
    loadKeys() {
      var self = this;
      var token = this.$store.getters.ixToken;
      if (!token) {
        this.listedKeys = [];
        return;
      }
      query('identity', 'apiKeys.list', undefined, token).then(function(res) {
        var rows = res.ok && res.data && res.data.json ? res.data.json : res.data;
        self.listedKeys = res.ok && Array.isArray(rows) ? rows : [];
      });
    },
    probeDoors() {
      var self = this;
      var key = this.mintedKey;
      if (!key) return;
      this.probingDoors = true;
      this.tradeProbe = { reason: null, message: '' };
      this.payProbe = { reason: null, message: '' };

      var trade = rest('/markets', { token: key }).then(function(res) {
        self.tradeProbe = {
          reason: res.ok ? 'ok' : res.reason,
          message: res.ok ? self.$t('intafaced.api.tradePath') : res.message
        };
      });
      var pay = query('pay', 'health', undefined, key).then(function(res) {
        self.payProbe = {
          reason: res.ok ? 'ok' : res.reason,
          message: res.ok ? self.$t('intafaced.api.payPath') : res.message
        };
      });
      Promise.all([trade, pay]).then(function() {
        self.probingDoors = false;
      });
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
        if (m.probePath) {
          pending.push(
            fetch(m.probePath, { method: 'GET', credentials: 'same-origin' }).then(function(res) {
              next[m.key] = { reason: res.ok ? 'ok' : 'error', edge: m.edge };
            }).catch(function() {
              next[m.key] = { reason: 'unreachable', edge: m.edge };
            })
          );
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
    },
    copyEmbed() {
      var self = this;
      var text = this.embedSnippet;
      var done = function() {
        self.embedCopied = true;
      };
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function() {
          self.fallbackCopy(text) && done();
        });
        return;
      }
      if (this.fallbackCopy(text)) done();
    },
    fallbackCopy(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) {
        return false;
      }
    },
    probeWidget() {
      var self = this;
      this.widget = this.emptySection();
      fetch('/api/widget/ramp', { method: 'GET', credentials: 'same-origin' })
        .then(function(res) {
          return res.text().then(function(text) {
            var unset = text.indexOf('ops.infra_licence_unset') !== -1;
            if (unset) {
              self.widget = {
                loading: false,
                reason: 'ops.infra_licence_unset',
                message: 'ops.infra_licence_unset',
                data: null
              };
              return;
            }
            if (res.ok) {
              self.widget = { loading: false, reason: 'ok', message: '', data: { licensed: true } };
              return;
            }
            self.widget = {
              loading: false,
              reason: 'error',
              message: (text || '').slice(0, 240),
              data: null
            };
          });
        })
        .catch(function() {
          self.widget = {
            loading: false,
            reason: 'unreachable',
            message: 'Could not reach svc-edge',
            data: null
          };
        });
    }
  }
};
</script>
<style scoped>
.money-platform {
  max-width: 760px;
  min-height: calc(100vh - 48px);
  margin: 0;
  padding: 16px 20px 40px;
  background: #000;
}
.money-platform /deep/ .ix-page-head { margin-bottom: 14px; }
.money-platform /deep/ .ix-page-head h1 { font-size: 16px; letter-spacing: .04em; }
.money-platform /deep/ .ix-page-head .ix-source { color: #8a8a8a; }
.money-platform-note {
  margin: 0 0 16px !important;
  padding: 8px 0;
  color: #8a8a8a;
  font-size: 12px;
  background: #000;
  border: 0;
  border-top: 1px solid #202020;
  border-bottom: 1px solid #202020;
  border-radius: 0;
}
.money-platform /deep/ .ix-card {
  margin: 0;
  padding: 16px 0;
  background: #000;
  border: 0;
  border-top: 1px solid #202020;
  border-radius: 0;
  box-shadow: none;
}
.money-platform-session /deep/ .ivu-input,
.money-platform-session /deep/ .ivu-btn { border-radius: 0; }
@media screen and (max-width: 640px) {
  .money-platform { width: 100%; padding: 12px; }
  .money-platform /deep/ .ix-note { overflow-wrap: anywhere; }
}
</style>
