<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.academy.title') }}</h1>
      <p>{{ $t('intafaced.modules.academy.blurb') }}</p>
      <div class="ix-source">svc-academy · /api/academy/trpc</div>
    </div>

    <div class="ix-note ix-note-quiet" style="margin-bottom:20px;">
      {{ $t('intafaced.modules.academy.note') }}
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.academy.createRoom') }}</h2>
        <span class="ix-sub">createRoom</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.academy.createRoomLead') }}</p>
      <div class="ix-field-grid">
        <div class="ix-field">
          <label for="ix-academy-create-slug">{{ $t('intafaced.academy.createRoomSlug') }}</label>
          <Input element-id="ix-academy-create-slug" v-model="createForm.slug" :placeholder="$t('intafaced.academy.createRoomSlugHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-academy-create-name">{{ $t('intafaced.academy.name') }}</label>
          <Input element-id="ix-academy-create-name" v-model="createForm.name"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-academy-create-kind">{{ $t('intafaced.academy.kind') }}</label>
          <select id="ix-academy-create-kind" v-model="createForm.kind">
            <option v-for="k in roomKinds" :key="k" :value="k">{{ k }}</option>
          </select>
        </div>
        <div class="ix-field">
          <label for="ix-academy-create-access">{{ $t('intafaced.academy.access') }}</label>
          <select id="ix-academy-create-access" v-model="createForm.access">
            <option v-for="a in roomAccesses" :key="a" :value="a">{{ a }}</option>
          </select>
        </div>
        <div class="ix-field">
          <label for="ix-academy-create-capacity">{{ $t('intafaced.academy.capacity') }}</label>
          <Input element-id="ix-academy-create-capacity" v-model="createForm.capacity"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-academy-create-min-stake">{{ $t('intafaced.academy.minStake') }}</label>
          <Input element-id="ix-academy-create-min-stake" v-model="createForm.minStake"></Input>
        </div>
      </div>
      <div class="ix-actions" style="margin-top:16px;">
        <Button v-if="canWrite" type="primary" size="small" :loading="createAction.busy" :disabled="!canSubmitCreate" @click="createRoom">
          {{ $t('intafaced.academy.createRoomSubmit') }}
        </Button>
        <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.createRoomSignIn') }}</router-link>
      </div>
      <div v-if="createAction.ran" style="margin-top:14px;">
        <div v-if="createAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.academy.createRoomCreated') }}</strong>
          <div style="margin-top:6px;">{{ createAction.data && createAction.data.name }}</div>
        </div>
        <IxState v-else :loading="createAction.busy" :reason="createAction.reason" :message="createAction.message" endpoint="/api/academy/trpc/createRoom"></IxState>
      </div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.academy.rooms') }}</h2>
        <span class="ix-sub">rooms</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.academy.roomsLead') }}</p>
      <IxState :loading="rooms.loading" :reason="rooms.reason" :message="rooms.message" endpoint="/api/academy/trpc/rooms">
        <div v-if="rooms.data && rooms.data.length" class="ix-scroll">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.academy.name') }}</th>
                <th>{{ $t('intafaced.academy.kind') }}</th>
                <th>{{ $t('intafaced.academy.access') }}</th>
                <th>{{ $t('intafaced.academy.capacity') }}</th>
                <th>{{ $t('intafaced.academy.minStake') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rooms.data" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ r.kind }}</td>
                <td>{{ r.access }}</td>
                <td>{{ r.capacity }}</td>
                <td>{{ r.minStake }}</td>
                <td>
                  <Button size="small" :loading="roomDetail.loading && selectedRoomId === r.id" @click="openRoom(r)">
                    {{ $t('intafaced.academy.open') }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div v-if="selectedRoomId" class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.academy.sessions') }}</h2>
        <span class="ix-sub">room · invite · scheduleSession · startSession · endSession · join · leave · streamCredential</span>
      </div>
      <p class="ix-lead">{{ $t('intafaced.academy.sessionsLead') }}</p>
      <IxState :loading="roomDetail.loading" :reason="roomDetail.reason" :message="roomDetail.message" endpoint="/api/academy/trpc/room">
        <div v-if="roomDetail.data && roomDetail.data.room" class="ix-kv" style="margin-bottom:16px;">
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.name') }}</span>
            <span class="v">{{ roomDetail.data.room.name }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.kind') }}</span>
            <span class="v">{{ roomDetail.data.room.kind }}</span>
          </div>
          <div class="ix-kv-item">
            <span class="k">{{ $t('intafaced.academy.access') }}</span>
            <span class="v">{{ roomDetail.data.room.access }}</span>
          </div>
        </div>
        <p class="ix-lead">{{ $t('intafaced.academy.inviteLead') }}</p>
        <div class="ix-field-grid">
          <div class="ix-field">
            <label for="ix-academy-invite-user">{{ $t('intafaced.academy.inviteUserId') }}</label>
            <Input element-id="ix-academy-invite-user" v-model="inviteForm.userId" :placeholder="$t('intafaced.academy.inviteUserIdHint')"></Input>
          </div>
          <div class="ix-field">
            <label for="ix-academy-invite-expires">{{ $t('intafaced.academy.inviteExpiresAt') }}</label>
            <Input element-id="ix-academy-invite-expires" v-model="inviteForm.expiresAt" :placeholder="$t('intafaced.academy.inviteExpiresAtHint')"></Input>
          </div>
        </div>
        <div class="ix-actions" style="margin-top:16px;">
          <Button v-if="canWrite" type="primary" size="small" :loading="inviteAction.busy" :disabled="!canSubmitInvite" @click="inviteUser">
            {{ $t('intafaced.academy.inviteSubmit') }}
          </Button>
          <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.inviteSignIn') }}</router-link>
        </div>
        <div v-if="inviteAction.ran" style="margin-top:14px;">
          <div v-if="inviteAction.reason === 'ok'" class="ix-done">
            <strong>{{ $t('intafaced.academy.inviteInvited') }}</strong>
          </div>
          <IxState v-else :loading="inviteAction.busy" :reason="inviteAction.reason" :message="inviteAction.message" endpoint="/api/academy/trpc/invite"></IxState>
        </div>
        <p class="ix-lead">{{ $t('intafaced.academy.scheduleLead') }}</p>
        <div class="ix-field-grid">
          <div class="ix-field">
            <label for="ix-academy-schedule-title">{{ $t('intafaced.academy.scheduleTitle') }}</label>
            <Input element-id="ix-academy-schedule-title" v-model="scheduleForm.title" :placeholder="$t('intafaced.academy.scheduleTitleHint')"></Input>
          </div>
          <div class="ix-field">
            <label for="ix-academy-schedule-starts">{{ $t('intafaced.academy.scheduleStartsAt') }}</label>
            <Input element-id="ix-academy-schedule-starts" v-model="scheduleForm.startsAt" :placeholder="$t('intafaced.academy.scheduleStartsAtHint')"></Input>
          </div>
        </div>
        <div class="ix-actions" style="margin-top:16px;">
          <Button v-if="canWrite" type="primary" size="small" :loading="scheduleAction.busy" :disabled="!canSubmitSchedule" @click="scheduleSession">
            {{ $t('intafaced.academy.scheduleSubmit') }}
          </Button>
          <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.scheduleSignIn') }}</router-link>
        </div>
        <div v-if="scheduleAction.ran" style="margin-top:14px;">
          <div v-if="scheduleAction.reason === 'ok'" class="ix-done">
            <strong>{{ $t('intafaced.academy.scheduleScheduled') }}</strong>
            <div style="margin-top:6px;">{{ scheduleAction.data && scheduleAction.data.title }}</div>
          </div>
          <IxState v-else :loading="scheduleAction.busy" :reason="scheduleAction.reason" :message="scheduleAction.message" endpoint="/api/academy/trpc/scheduleSession"></IxState>
        </div>
        <div v-if="sessions.length" class="ix-scroll" style="margin-top:16px;">
          <table class="ix-table">
            <thead>
              <tr>
                <th>{{ $t('intafaced.academy.sessionTitle') }}</th>
                <th>{{ $t('intafaced.academy.status') }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sessions" :key="s.id">
                <td>{{ s.title }}</td>
                <td>{{ s.status }}</td>
                <td>
                  <div class="ix-actions">
                    <Button v-if="canWrite && s.status === 'scheduled'" size="small" :loading="startAction.busy && activeSessionId === s.id" @click="startSession(s)">
                      {{ $t('intafaced.academy.startSession') }}
                    </Button>
                    <Button v-if="canWrite && (s.status === 'scheduled' || s.status === 'live')" size="small" :loading="endAction.busy && activeSessionId === s.id" @click="endSession(s)">
                      {{ $t('intafaced.academy.endSession') }}
                    </Button>
                    <Button v-if="canWrite" type="primary" size="small" :loading="joinAction.busy && activeSessionId === s.id" @click="joinSession(s)">
                      {{ $t('intafaced.academy.join') }}
                    </Button>
                    <router-link v-else-if="!ixToken" to="/platform">{{ $t('intafaced.academy.signInToJoin') }}</router-link>
                    <Button v-if="canWrite" size="small" :loading="leaveAction.busy && activeSessionId === s.id" @click="leaveSession(s)">
                      {{ $t('intafaced.academy.leave') }}
                    </Button>
                    <Button v-if="canWrite" size="small" :loading="streamAction.busy && activeSessionId === s.id" @click="streamCredential(s)">
                      {{ $t('intafaced.academy.stream') }}
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.academy.noSessions') }}</div>
      </IxState>

      <div v-if="joinAction.ran" style="margin-top:14px;">
        <div v-if="joinAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.academy.joined') }}</strong>
          <div style="margin-top:6px;">{{ $t('intafaced.academy.role') }}: {{ joinAction.data.role }}</div>
        </div>
        <IxState v-else :loading="joinAction.busy" :reason="joinAction.reason" :message="joinAction.message" endpoint="/api/academy/trpc/join"></IxState>
      </div>

      <div v-if="leaveAction.ran" style="margin-top:14px;">
        <div v-if="leaveAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.academy.left') }}</strong>
        </div>
        <IxState v-else :loading="leaveAction.busy" :reason="leaveAction.reason" :message="leaveAction.message" endpoint="/api/academy/trpc/leave"></IxState>
      </div>

      <div v-if="streamAction.ran" style="margin-top:14px;">
        <div v-if="streamAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.academy.streamIssued') }}</strong>
          <div style="margin-top:6px;">{{ streamAction.data.url }}</div>
        </div>
        <IxState v-else :loading="streamAction.busy" :reason="streamAction.reason" :message="streamAction.message" endpoint="/api/academy/trpc/streamCredential"></IxState>
      </div>

      <div v-if="startAction.ran" style="margin-top:14px;">
        <div v-if="startAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.academy.startSessionStarted') }}</strong>
        </div>
        <IxState v-else :loading="startAction.busy" :reason="startAction.reason" :message="startAction.message" endpoint="/api/academy/trpc/startSession"></IxState>
      </div>

      <div v-if="endAction.ran" style="margin-top:14px;">
        <div v-if="endAction.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.academy.endSessionEnded') }}</strong>
        </div>
        <IxState v-else :loading="endAction.busy" :reason="endAction.reason" :message="endAction.message" endpoint="/api/academy/trpc/endSession"></IxState>
      </div>
    </div>

    <IxAcademyCurriculum />
    <IxAcademyCerts />
    <IxAcademyCanvas :session-id-from-hub="activeSessionId || ''" />
  </div>
</template>

<script>
/**
 * svc-academy (§8.3) — lobbies on /academy.
 *
 * Rooms stay empty when the service lists none. Create/join/leave/schedule/invite
 * are writes; createRoom omits blank minStake rather than sending ''.
 * invite omits blank expiresAt. scheduleSession sends startsAt as an ISO string the service coerces.
 * Stream credentials refuse `academy.stream_unavailable` when no SFU is
 * configured rather than minting a fake A/V token. Named refuse stays named.
 */
import IxState from '../../components/intafaced/IxState.vue';
import IxAcademyCurriculum from './academy/Curriculum.vue';
import IxAcademyCerts from './academy/Certs.vue';
import IxAcademyCanvas from './academy/Canvas.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxAcademy',
  components: { IxState, IxAcademyCurriculum, IxAcademyCerts, IxAcademyCanvas },
  mixins: [ixModule],
  data() {
    return {
      rooms: this.emptySection(),
      roomDetail: this.emptySection(),
      createAction: this.emptyAction(),
      joinAction: this.emptyAction(),
      leaveAction: this.emptyAction(),
      streamAction: this.emptyAction(),
      scheduleAction: this.emptyAction(),
      startAction: this.emptyAction(),
      endAction: this.emptyAction(),
      inviteAction: this.emptyAction(),
      selectedRoomId: null,
      activeSessionId: null,
      roomKinds: ['general', 'futures', 'options', 'meme_war_room', 'forex', 'defi_lab', 'merchant_clinic'],
      roomAccesses: ['free', 'staked', 'invite'],
      createForm: { slug: '', name: '', kind: 'general', access: 'free', capacity: '', minStake: '' },
      scheduleForm: { title: '', startsAt: '' },
      inviteForm: { userId: '', expiresAt: '' }
    };
  },
  computed: {
    canWrite() {
      return !!this.ixToken;
    },
    sessions() {
      return (this.roomDetail.data && this.roomDetail.data.sessions) || [];
    },
    canSubmitCreate() {
      var slug = (this.createForm.slug || '').trim();
      var name = (this.createForm.name || '').trim();
      return !!slug && !!name && /^\d+$/.test(String(this.createForm.capacity).trim()) && parseInt(this.createForm.capacity, 10) >= 1;
    },
    canSubmitSchedule() {
      var title = (this.scheduleForm.title || '').trim();
      var startsAt = (this.scheduleForm.startsAt || '').trim();
      return title.length >= 1 && title.length <= 160 && !!startsAt;
    },
    canSubmitInvite() {
      var userId = (this.inviteForm.userId || '').trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('rooms', query('academy', 'rooms', undefined, this.ixToken));
  },
  methods: {
    createRoom() {
      var self = this;
      var slug = (this.createForm.slug || '').trim().toLowerCase();
      var name = (this.createForm.name || '').trim();
      var capacity = parseInt(this.createForm.capacity, 10);
      if (!slug || !name || capacity !== capacity || capacity < 1) return;
      var input = {
        slug: slug,
        name: name,
        kind: this.createForm.kind,
        access: this.createForm.access,
        capacity: capacity
      };
      var minStake = (this.createForm.minStake || '').trim();
      if (minStake) input.minStake = minStake;
      this.act('createAction', mutate('academy', 'createRoom', input, this.ixToken)).then(function (res) {
        if (res.ok) self.load('rooms', query('academy', 'rooms', undefined, self.ixToken));
      });
    },
    openRoom(room) {
      this.selectedRoomId = room.id;
      this.load('roomDetail', query('academy', 'room', { roomId: room.id }, this.ixToken));
    },
    reloadRoom() {
      if (!this.selectedRoomId) return;
      this.load('roomDetail', query('academy', 'room', { roomId: this.selectedRoomId }, this.ixToken));
    },
    joinSession(session) {
      var self = this;
      this.activeSessionId = session.id;
      this.act('joinAction', mutate('academy', 'join', { sessionId: session.id }, this.ixToken)).then(function (res) {
        if (res.ok) self.reloadRoom();
      });
    },
    leaveSession(session) {
      var self = this;
      this.activeSessionId = session.id;
      this.act('leaveAction', mutate('academy', 'leave', { sessionId: session.id }, this.ixToken)).then(function (res) {
        if (res.ok) self.reloadRoom();
      });
    },
    streamCredential(session) {
      this.activeSessionId = session.id;
      this.act('streamAction', mutate('academy', 'streamCredential', { sessionId: session.id }, this.ixToken));
    },
    scheduleSession() {
      var self = this;
      var title = (this.scheduleForm.title || '').trim();
      var startsAt = (this.scheduleForm.startsAt || '').trim();
      if (!this.selectedRoomId || title.length < 1 || title.length > 160 || !startsAt) return;
      this.act('scheduleAction', mutate('academy', 'scheduleSession', {
        roomId: this.selectedRoomId,
        title: title,
        startsAt: startsAt
      }, this.ixToken)).then(function (res) {
        if (res.ok) self.reloadRoom();
      });
    },
    inviteUser() {
      var self = this;
      var userId = (this.inviteForm.userId || '').trim();
      if (!this.selectedRoomId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return;
      var input = { roomId: this.selectedRoomId, userId: userId };
      var expiresAt = (this.inviteForm.expiresAt || '').trim();
      if (expiresAt) input.expiresAt = expiresAt;
      this.act('inviteAction', mutate('academy', 'invite', input, this.ixToken)).then(function (res) {
        if (res.ok) self.reloadRoom();
      });
    },
    startSession(session) {
      var self = this;
      this.activeSessionId = session.id;
      this.act('startAction', mutate('academy', 'startSession', { sessionId: session.id }, this.ixToken)).then(function (res) {
        if (res.ok) self.reloadRoom();
      });
    },
    endSession(session) {
      var self = this;
      this.activeSessionId = session.id;
      this.act('endAction', mutate('academy', 'endSession', { sessionId: session.id }, this.ixToken)).then(function (res) {
        if (res.ok) self.reloadRoom();
      });
    }
  }
};
</script>
