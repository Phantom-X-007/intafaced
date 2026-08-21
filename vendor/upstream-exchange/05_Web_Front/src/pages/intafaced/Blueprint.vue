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
        <h2>{{ $t('intafaced.blueprint.onboardTitle') }}</h2>
        <span class="ix-sub">onboard</span>
      </div>
      <p style="color:var(--ix-text-dim);font-size:13.5px;line-height:1.6;margin:0 0 16px;">
        {{ $t('intafaced.blueprint.onboardLead') }}
      </p>
      <div class="ix-form-row">
        <div class="ix-field">
          <label for="ix-blueprint-key">{{ $t('intafaced.blueprint.onboardKey') }}</label>
          <Input element-id="ix-blueprint-key" v-model="responseKey" :placeholder="$t('intafaced.blueprint.onboardKeyHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-blueprint-value">{{ $t('intafaced.blueprint.onboardValue') }}</label>
          <Input element-id="ix-blueprint-value" v-model="responseValue" :placeholder="$t('intafaced.blueprint.onboardValueHint')"></Input>
        </div>
        <div class="ix-field">
          <label>{{ $t('intafaced.blueprint.onboardVisibility') }}</label>
          <Select v-model="visibility" :placeholder="$t('intafaced.blueprint.onboardVisibility')">
            <Option value="private" :label="$t('intafaced.blueprint.onboardPrivate')"></Option>
            <Option value="crew" :label="$t('intafaced.blueprint.onboardCrew')"></Option>
            <Option value="public" :label="$t('intafaced.blueprint.onboardPublic')"></Option>
          </Select>
        </div>
        <div class="ix-form-action">
          <Button type="primary" :loading="onboarded.busy" :disabled="!canOnboard" @click="submitOnboard">
            {{ $t('intafaced.blueprint.onboardNow') }}
          </Button>
        </div>
      </div>
      <div class="ix-form-row" style="margin-top:12px;">
        <div class="ix-field">
          <label for="ix-blueprint-date">{{ $t('intafaced.blueprint.onboardBirthDate') }}</label>
          <Input element-id="ix-blueprint-date" v-model="birthDate" :placeholder="$t('intafaced.blueprint.onboardBirthDateHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-blueprint-time">{{ $t('intafaced.blueprint.onboardBirthTime') }}</label>
          <Input element-id="ix-blueprint-time" v-model="birthTime" :placeholder="$t('intafaced.blueprint.onboardBirthTimeHint')"></Input>
        </div>
        <div class="ix-field">
          <label for="ix-blueprint-place">{{ $t('intafaced.blueprint.onboardBirthPlace') }}</label>
          <Input element-id="ix-blueprint-place" v-model="birthPlace" :placeholder="$t('intafaced.blueprint.onboardBirthPlaceHint')"></Input>
        </div>
        <div class="ix-field">
          <label>{{ $t('intafaced.blueprint.onboardMentor') }}</label>
          <Select v-model="mentorChoice">
            <Option value="no" :label="$t('intafaced.blueprint.onboardMentorNo')"></Option>
            <Option value="yes" :label="$t('intafaced.blueprint.onboardMentorYes')"></Option>
          </Select>
        </div>
      </div>
      <div v-if="onboarded.ran" style="margin-top:14px;">
        <div v-if="onboarded.reason === 'ok'" class="ix-done">
          <strong>{{ $t('intafaced.blueprint.onboardAccepted') }}</strong>
          <div v-if="onboarded.data && onboarded.data.placement" style="margin-top:6px;">
            {{ onboarded.data.placement.crewName }} · {{ onboarded.data.placement.score }}
          </div>
        </div>
        <IxState v-else :loading="onboarded.busy" :reason="onboarded.reason" :message="onboarded.message" endpoint="/api/blueprint/trpc/onboard"></IxState>
      </div>
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
      <div class="ix-actions" style="margin-bottom:16px;">
        <Button
          size="small"
          :type="cardSize === 'portrait' ? 'primary' : 'default'"
          :loading="card.loading && cardSize === 'portrait'"
          @click="loadCard('portrait')"
        >{{ $t('intafaced.blueprint.cardPortrait') }}</Button>
        <Button
          size="small"
          :type="cardSize === 'landscape' ? 'primary' : 'default'"
          :loading="card.loading && cardSize === 'landscape'"
          @click="loadCard('landscape')"
        >{{ $t('intafaced.blueprint.cardLandscape') }}</Button>
      </div>
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
 * svc-blueprint (§7) — profile, share card (#216), mentors, onboard.
 *
 * Still gated on blueprint:read / blueprint:write which interactive sessions
 * may not hold — the refusal is the honest answer. Card raster "unavailable"
 * is data (no PNG rail), not a fake image URL. SVG is rendered only from the
 * service response. Portrait and landscape both reload query('blueprint','card',{size}).
 *
 * `onboard` binds userId to the signed principal on the router — none is sent
 * from the browser. A missing Neural Engine is a service refusal (IxState),
 * never a locally invented profile. Birth data is optional wire input; it is
 * not kept on this page after submit.
 *
 * Export / erase are not drawn: erase is a hard delete and belongs behind an
 * explicit product confirm path, not a casual button on this hub page.
 */
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';

export default {
  name: 'IxBlueprint',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      responseKey: '',
      responseValue: '',
      visibility: 'private',
      birthDate: '',
      birthTime: '',
      birthPlace: '',
      mentorChoice: 'no',
      me: this.emptySection(),
      card: this.emptySection(),
      mentors: this.emptySection(),
      onboarded: this.emptyAction(),
      cardSize: 'portrait'
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
    },
    canOnboard() {
      return typeof this.responseKey === 'string' && this.responseKey.length > 0
        && typeof this.responseValue === 'string' && this.responseValue.length > 0;
    }
  },
  created() {
    this.$store.commit('navigate', 'nav-platform');
    this.reload();
  },
  methods: {
    loadCard(size) {
      this.cardSize = size === 'landscape' ? 'landscape' : 'portrait';
      this.load('card', query('blueprint', 'card', { size: this.cardSize }, this.ixToken));
    },
    reload() {
      this.load('me', query('blueprint', 'me', undefined, this.ixToken));
      this.loadCard('portrait');
      this.load('mentors', query('blueprint', 'mentors', undefined, this.ixToken));
    },
    submitOnboard() {
      var self = this;
      if (!this.canOnboard) return;
      var input = {
        locale: 'en',
        responses: [{ key: this.responseKey, value: this.responseValue }],
        visibility: this.visibility,
        mentorAvailable: this.mentorChoice === 'yes'
      };
      if (typeof this.birthDate === 'string' && this.birthDate.length > 0) {
        var birthData = { date: this.birthDate };
        if (typeof this.birthTime === 'string' && this.birthTime.length > 0) birthData.time = this.birthTime;
        if (typeof this.birthPlace === 'string' && this.birthPlace.length > 0) birthData.place = this.birthPlace;
        input.birthData = birthData;
      }
      this.act('onboarded', mutate('blueprint', 'onboard', input, this.ixToken)).then(function(res) {
        if (!res.ok) return;
        self.responseKey = '';
        self.responseValue = '';
        self.reload();
      });
    }
  }
};
</script>
