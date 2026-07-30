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
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.academy.roomsLead') }}
      </p>
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
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rooms.data" :key="r.id">
                <td>{{ r.name }}</td>
                <td>{{ r.kind }}</td>
                <td>{{ r.access }}</td>
                <td>{{ r.capacity }}</td>
                <td>{{ r.minStake }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-academy (§8.3) — live lobbies on main.
 *
 * Read-only: lists rooms. Join/host/stream credentials are write paths and are
 * not drawn here. `academy:read` may be refused by scope — that refusal is the
 * answer, not an empty "no lobbies" table.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxAcademy',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return { rooms: this.emptySection() };
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('rooms', query('academy', 'rooms', undefined, this.ixToken));
  }
};
</script>
