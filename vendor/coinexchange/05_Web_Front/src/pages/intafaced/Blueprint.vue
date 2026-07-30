<template>
  <div class="ix-page">
    <div class="ix-page-head">
      <h1>{{ $t('intafaced.modules.blueprint.title') }}</h1>
      <p>{{ $t('intafaced.modules.blueprint.blurb') }}</p>
      <div class="ix-source">svc-blueprint · /api/blueprint/trpc</div>
    </div>

    <div class="ix-note" style="margin-bottom:20px;">
      <strong>{{ $t('intafaced.modules.blueprint.title') }}</strong>
      <div style="margin-top:6px;">{{ $t('intafaced.modules.blueprint.note') }}</div>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.blueprint.meTitle') }}</h2>
        <span class="ix-sub">me</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.blueprint.lead') }}
      </p>
      <IxState :loading="me.loading" :reason="me.reason" :message="me.message" endpoint="/api/blueprint/trpc/me">
        <div v-if="me.data" class="ix-scroll">
          <pre class="ix-pre">{{ prettyMe }}</pre>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.blueprint.cardTitle') }}</h2>
        <span class="ix-sub">card</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.blueprint.cardLead') }}
      </p>
      <IxState :loading="card.loading" :reason="card.reason" :message="card.message" endpoint="/api/blueprint/trpc/card">
        <div v-if="card.data" class="ix-kv">
          <div class="ix-kv-item" v-if="card.data.size">
            <span class="k">{{ $t('intafaced.blueprint.cardSize') }}</span>
            <span class="v">{{ card.data.size }}</span>
          </div>
          <div class="ix-kv-item" v-if="card.data.raster">
            <span class="k">{{ $t('intafaced.blueprint.raster') }}</span>
            <span class="v">{{ card.data.raster.status }}{{ card.data.raster.code ? ' · ' + card.data.raster.code : '' }}</span>
          </div>
          <div class="ix-kv-item" v-if="card.data.svg">
            <span class="k">{{ $t('intafaced.blueprint.svgBytes') }}</span>
            <span class="v">{{ card.data.svg.length }}</span>
          </div>
          <!-- SVG preview only when the service returned real markup; never invent a card -->
          <div v-if="card.data.svg" class="ix-scroll" style="margin-top:12px;" v-html="safeSvg"></div>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>

    <div class="ix-card">
      <div class="ix-card-head">
        <h2>{{ $t('intafaced.blueprint.mentorsTitle') }}</h2>
        <span class="ix-sub">mentors</span>
      </div>
      <IxState :loading="mentors.loading" :reason="mentors.reason" :message="mentors.message" endpoint="/api/blueprint/trpc/mentors">
        <div v-if="mentors.data && mentors.data.length" class="ix-scroll">
          <pre class="ix-pre">{{ prettyMentors }}</pre>
        </div>
        <div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.state.empty') }}</div>
      </IxState>
    </div>
  </div>
</template>

<script>
/**
 * svc-blueprint (§7) — profile, share card (#216), mentors.
 *
 * Still gated on blueprint:read which interactive sessions may not hold — the
 * refusal is the honest answer. Card raster "unavailable" is data (no PNG rail),
 * not a fake image URL. SVG is rendered only from the service response.
 *
 * Export / erase are not drawn: erase is a hard delete and belongs behind an
 * explicit product confirm path, not a casual button on this hub page.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBlueprint',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      me: this.emptySection(),
      card: this.emptySection(),
      mentors: this.emptySection()
    };
  },
  computed: {
    prettyMe() {
      try {
        return JSON.stringify(this.me.data, null, 2);
      } catch (e) {
        return '';
      }
    },
    prettyMentors() {
      try {
        return JSON.stringify(this.mentors.data, null, 2);
      } catch (e) {
        return '';
      }
    },
    safeSvg() {
      // Only allow an SVG document string from the service. Reject anything else.
      var svg = this.card.data && this.card.data.svg;
      if (typeof svg !== 'string') return '';
      var trimmed = svg.replace(/^\s+/, '');
      if (trimmed.indexOf('<svg') !== 0 && trimmed.indexOf('<?xml') !== 0) return '';
      return svg;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.load('me', query('blueprint', 'me', undefined, this.ixToken));
    this.load('card', query('blueprint', 'card', { size: 'portrait' }, this.ixToken));
    this.load('mentors', query('blueprint', 'mentors', undefined, this.ixToken));
  }
};
</script>
