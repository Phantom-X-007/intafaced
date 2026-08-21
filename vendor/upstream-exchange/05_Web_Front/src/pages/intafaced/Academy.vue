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
        <span class="ix-sub">room · join · leave · streamCredential</span>
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
        <div v-if="sessions.length" class="ix-scroll">
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
    </div>

    <IxAcademyCurriculum />
  </div>
</template>

<script>
/**
 * svc-academy (§8.3) — lobbies on /academy.
 *
 * Rooms stay empty when the service lists none. Join/leave are writes; stream
 * credentials refuse `academy.stream_unavailable` when no SFU is configured
 * rather than minting a fake A/V token.
 */
import IxState from '../../components/intafaced/IxState.vue';
import IxAcademyCurriculum from './academy/Curriculum.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxAcademy',
  components: { IxState, IxAcademyCurriculum },
  mixins: [ixModule],
  data() {
    return {
      rooms: this.emptySection(),
      roomDetail: this.emptySection(),
      joinAction: this.emptyAction(),
      leaveAction: this.emptyAction(),
      streamAction: this.emptyAction(),
      selectedRoomId: null,
      activeSessionId: null
    };
  },
  computed: {
    canWrite() {
      return !!this.ixToken;
    },
    sessions() {
      return (this.roomDetail.data && this.roomDetail.data.sessions) || [];
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('rooms', query('academy', 'rooms', undefined, this.ixToken));
  },
  methods: {
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
    }
  }
};
</script>
