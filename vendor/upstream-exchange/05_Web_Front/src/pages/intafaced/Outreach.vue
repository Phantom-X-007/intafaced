<template>
  <div class="public-page outreach-page">
    <section class="outreach-intro" aria-labelledby="outreach-title">
      <p class="outreach-eyebrow">INTAFACED · PRELAUNCH</p>
      <h1 id="outreach-title">A connected financial world.<br />Start a conversation.</h1>
      <p>We are building INTAFACED around trading, payments, learning and community. Tell us where you would like to take part.</p>
      <p class="outreach-small">
        No account required. An enquiry expresses interest and does not grant product access or create an investment commitment.
      </p>
      <nav aria-label="Enquiry journeys" class="outreach-journeys">
        <router-link v-for="a in audiences" :key="a.key" :to="journeyPath(a.path)">{{ a.label }}</router-link>
      </nav>
    </section>

    <section class="outreach-form-panel" aria-labelledby="intake-heading" :aria-busy="busy ? 'true' : 'false'">
      <p class="outreach-eyebrow">{{ progressLabel }}</p>
      <h2 id="intake-heading" ref="stepHeading" tabindex="-1">{{ stepTitle }}</h2>
      <p v-if="error" ref="error" tabindex="-1" class="outreach-notice" role="alert">{{ error }}</p>
      <button v-if="continuationUnavailable" type="button" class="outreach-secondary" :disabled="busy" @click="startNew">
        Start a new enquiry
      </button>
      <p v-if="!state.storageAvailable" class="outreach-notice" role="status">
        Your browser cannot save your progress here. Keep this page open to finish. Refreshing or reopening it may lose access to your
        enquiry.
      </p>

      <div v-if="resumeAvailable && !draft" class="outreach-resume">
        <p>A saved enquiry is available in this browser tab.</p>
        <button type="button" class="outreach-primary" :disabled="busy" @click="reopen">
          {{ busy ? 'Reopening…' : 'Reopen saved enquiry' }}
        </button>
        <button v-if="!continuationUnavailable" type="button" class="outreach-secondary" :disabled="busy" @click="startNew">
          Start a new enquiry
        </button>
      </div>

      <form v-else-if="!draft" @submit.prevent="saveContact">
        <fieldset class="outreach-interests" :disabled="busy">
          <legend>What interests you? <span>Select one or more.</span></legend>
          <label
            v-for="a in audiences"
            :key="a.key"
            class="outreach-interest"
            :class="{ selected: contact.interests.indexOf(a.key) !== -1 }"
          >
            <input v-model="contact.interests" type="checkbox" :value="a.key" />
            <span
              ><strong>{{ a.label }}</strong
              ><small>{{ a.description }}</small></span
            >
          </label>
        </fieldset>
        <div class="outreach-grid">
          <label
            >Your name <span aria-hidden="true">*</span
            ><input v-model.trim="contact.name" name="name" autocomplete="name" maxlength="120" required :disabled="busy"
          /></label>
          <label
            >Email <span aria-hidden="true">*</span
            ><input v-model.trim="contact.email" name="email" autocomplete="email" type="email" maxlength="254" required :disabled="busy"
          /></label>
          <label
            >Organisation <small>Optional</small
            ><input
              v-model.trim="contact.organisationName"
              name="organization"
              autocomplete="organization"
              maxlength="160"
              :disabled="busy"
          /></label>
          <label
            >Country <small>Optional</small>
            <select v-model="contact.country" name="country" autocomplete="country" :disabled="busy">
              <option value="">Prefer not to say</option>
              <option v-for="country in countries" :key="country.code" :value="country.code">{{ country.name }}</option>
            </select>
          </label>
        </div>
        <p class="outreach-small">
          By saving your enquiry, you ask INTAFACED to review it and contact you about your interests. Name, email and at least one interest
          are required.
        </p>
        <label class="outreach-consent"
          ><input v-model="contact.marketingOptIn" type="checkbox" :disabled="busy" /><span
            >Also send me optional INTAFACED news and marketing updates.</span
          ></label
        >
        <p class="outreach-small">Marketing permission is optional and separate from replies about this enquiry.</p>
        <button type="submit" class="outreach-primary" :disabled="busy">
          {{ busy ? 'Saving your enquiry…' : 'Save contact & continue' }} <span aria-hidden="true">→</span>
        </button>
        <p class="outreach-small">Save your details, then tell us more. You can return to this tab to finish.</p>
      </form>

      <template v-else>
        <p class="outreach-saved" role="status">Your contact enquiry is saved for review.</p>
        <p class="outreach-small">
          {{ savedCount }} of {{ draft.contact.interests.length }} selected questionnaires saved. Submitted answers are preserved.
        </p>
        <progress
          :value="savedCount"
          :max="draft.contact.interests.length"
          :aria-label="'Questionnaires saved: ' + savedCount + ' of ' + draft.contact.interests.length"
        ></progress>
        <p class="outreach-small">You can return to this tab until {{ expiryLabel }}.</p>

        <form v-if="currentAudience" :key="currentAudience" @submit.prevent="saveAnswers">
          <p class="outreach-small">All questions are required unless marked optional.</p>
          <div class="outreach-questions">
            <template v-for="f in fields">
              <fieldset v-if="f.type === 'checks'" :key="f.key" :disabled="busy">
                <legend>{{ f.label }}</legend>
                <label v-for="o in f.options" :key="o[0]" class="outreach-consent"
                  ><input v-model="answers[f.key]" type="checkbox" :value="o[0]" /><span>{{ o[1] }}</span></label
                >
              </fieldset>
              <fieldset v-else-if="f.type === 'countries'" :key="f.key" :disabled="busy">
                <legend>{{ f.label }}</legend>
                <select v-model="answers[f.key]" multiple size="6" required :aria-label="f.label">
                  <option v-for="country in countries" :key="country.code" :value="country.code">{{ country.name }}</option>
                </select>
                <p class="outreach-small">Select one or more countries. On a computer, hold Ctrl or ⌘ to select several.</p>
              </fieldset>
              <label v-else :key="f.key"
                >{{ f.label }}
                <select v-if="f.type === 'select'" v-model="answers[f.key]" required :disabled="busy">
                  <option disabled value="">Select an option</option>
                  <option v-for="o in f.options" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
                </select>
                <textarea
                  v-else-if="f.type === 'textarea'"
                  v-model.trim="answers[f.key]"
                  :maxlength="f.max"
                  :required="f.key !== 'scope'"
                  :disabled="busy"
                  rows="4"
                ></textarea>
                <input
                  v-else
                  v-model.trim="answers[f.key]"
                  :type="f.type === 'url' ? 'url' : 'text'"
                  :maxlength="f.max"
                  :required="f.key !== 'website'"
                  :disabled="busy"
                />
              </label>
            </template>
            <fieldset v-if="currentAudience === 'investor' || currentAudience === 'merchant'" :disabled="busy">
              <legend>{{ currentAudience === 'investor' ? 'Indicative contribution (optional)' : 'Processing volume (optional)' }}</legend>
              <p class="outreach-small">For context only. No payment or commitment is created.</p>
              <label
                >Status<select v-model="answers.amountStatus">
                  <option :value="currentAudience === 'investor' ? 'undecided' : 'unknown'">
                    {{ currentAudience === 'investor' ? 'Undecided' : 'Unknown' }}
                  </option>
                  <option value="stated">I would like to state an amount</option>
                </select></label
              >
              <div v-if="answers.amountStatus === 'stated'" class="outreach-grid outreach-amount">
                <label
                  >Amount<input
                    v-model.trim="answers.amount"
                    type="text"
                    inputmode="decimal"
                    pattern="(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?"
                    maxlength="60"
                    required
                    aria-describedby="amount-help"
                /></label>
                <label
                  >Currency code<input
                    v-model.trim="answers.currency"
                    type="text"
                    pattern="[A-Z]{3}"
                    maxlength="3"
                    required
                    placeholder="USD"
                /></label>
                <label v-if="currentAudience === 'merchant'"
                  >Volume period<select v-model="answers.period" required>
                    <option disabled value="">Select a period</option>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select></label
                >
                <p id="amount-help" class="outreach-small">
                  Use digits and a decimal point, without commas. Currency is a three-letter uppercase code.
                </p>
              </div>
            </fieldset>
            <label
              >When would you like to take part?<select v-model="answers.timing" required :disabled="busy">
                <option disabled value="">Select timing</option>
                <option v-for="o in timing" :key="o[0]" :value="o[0]">{{ o[1] }}</option>
              </select></label
            >
            <label
              >Anything else? <small>Optional</small
              ><textarea v-model.trim="answers.message" maxlength="2000" rows="3" :disabled="busy"></textarea>
            </label>
          </div>
          <button type="submit" class="outreach-primary" :disabled="busy">
            {{ busy ? 'Saving answers…' : 'Save ' + audienceLabel(currentAudience).toLowerCase() + ' answers' }}
            <span aria-hidden="true">→</span>
          </button>
          <button type="button" class="outreach-secondary" :disabled="busy" @click="reopen">Refresh saved progress</button>
        </form>
        <div v-else-if="complete" class="outreach-complete">
          <h3>Thank you. Your selected enquiries are complete.</h3>
          <p>The team will review your enquiry and follow up using the email you provided.</p>
          <ul>
            <li v-for="audience in draft.contact.interests" :key="audience">{{ audienceLabel(audience) }} · saved</li>
          </ul>
        </div>
        <div v-else>
          <p>Your answers are saved. We could not confirm completion yet.</p>
          <button type="button" class="outreach-secondary" :disabled="busy" @click="reopen">Refresh saved progress</button>
        </div>
      </template>
    </section>
  </div>
</template>

<script>
import { mutate } from '../../config/intafaced.js';
let intake = require('../../assets/js/outreach-intake.js');
let countryOptions = require('../../assets/js/outreach-countries.js').countryOptions;
let AUDIENCES = [
  { key: 'investor', path: '/invest', label: 'Investor', description: 'Discuss backing INTAFACED or introduce an investor' },
  { key: 'trader', path: '/trade', label: 'Trader', description: 'Share your markets and trading interests.' },
  { key: 'merchant', path: '/merchant', label: 'Merchant', description: 'Explore payment acceptance, settlement or payouts' },
  { key: 'academy', path: '/academy', label: 'Academy', description: 'Tell us what you want to learn' },
  { key: 'partner', path: '/partner', label: 'Partner', description: 'Explore a collaboration or partnership' },
];
export default {
  name: 'IxOutreach',
  data() {
    let storage;
    try {
      storage = window.sessionStorage;
    } catch (e) {
      storage = null;
    }
    let controller = intake.createIntake({
      storage: storage,
      crypto: window.crypto,
      encode: window.btoa.bind(window),
      now: Date.now,
      send: function (method, input) {
        return mutate('ops', 'outreach.' + method, input, null);
      },
    });
    let restored = controller.state.local && controller.state.local.capture;
    return {
      controller: controller,
      state: controller.state,
      busy: false,
      error: '',
      errorCode: '',
      audiences: AUDIENCES,
      countries: countryOptions('en'),
      timing: intake.timing,
      contact: restored
        ? Object.assign({ organisationName: '', country: '' }, restored.contact)
        : {
            name: '',
            email: '',
            organisationName: '',
            country: '',
            interests: [intake.audienceForPath(this.$route.path)].filter(Boolean),
            marketingOptIn: false,
          },
      answers: {},
    };
  },
  computed: {
    continuationUnavailable() {
      return /continuation_invalid/.test(this.errorCode);
    },
    draft() {
      return this.state.draft;
    },
    resumeAvailable() {
      return !!(this.state.local && this.state.local.receipt);
    },
    savedCount() {
      return this.draft ? this.draft.questionnaires.length : 0;
    },
    currentAudience() {
      let d = this.draft;
      return (
        d &&
        intake.AUDIENCES.find(function (a) {
          return (
            d.contact.interests.includes(a) &&
            !d.questionnaires.some(function (q) {
              return q.audience === a;
            })
          );
        })
      );
    },
    fields() {
      return intake.QUESTIONS[this.currentAudience] || [];
    },
    complete() {
      return this.draft && !!this.draft.completedAt && this.savedCount === this.draft.contact.interests.length;
    },
    progressLabel() {
      return !this.draft
        ? 'STEP 1 · YOUR CONTACT'
        : this.complete
          ? 'ALL SELECTED QUESTIONS SAVED'
          : 'STEP ' + (this.savedCount + 2) + ' OF ' + (this.draft.contact.interests.length + 1);
    },
    stepTitle() {
      return !this.draft
        ? 'Where would you like to take part?'
        : this.currentAudience
          ? this.audienceLabel(this.currentAudience) + ' enquiry'
          : 'Your enquiry';
    },
    expiryLabel() {
      return this.draft ? new Date(this.draft.continuationExpiresAt).toLocaleString() : '';
    },
  },
  watch: {
    currentAudience: {
      immediate: true,
      handler() {
        this.resetAnswers();
      },
    },
    '$route.path': function (path) {
      if (!this.draft && !this.state.local) this.contact.interests = [intake.audienceForPath(path)].filter(Boolean);
    },
  },
  methods: {
    audienceLabel(a) {
      let row = AUDIENCES.find(function (v) {
        return v.key === a;
      });
      return row ? row.label : '';
    },
    journeyPath(path) {
      return intake.isJoinHost(window.location.hostname) || ['/invest', '/trade', '/merchant'].includes(path) ? path : '/join' + path;
    },
    resetAnswers() {
      let values = {
        timing: '',
        message: '',
        amountStatus: this.currentAudience === 'merchant' ? 'unknown' : 'undecided',
        amount: '',
        currency: '',
        period: '',
      };
      this.fields.forEach(function (f) {
        values[f.key] = f.type === 'checks' || f.type === 'countries' ? [] : '';
      });
      let pending = this.state.local && this.state.local.answer;
      if (pending && pending.questionnaire.audience === this.currentAudience) {
        Object.assign(values, pending.questionnaire.answers);
        ['subjects'].forEach(function (k) {
          if (Array.isArray(values[k])) values[k] = values[k].join(', ');
        });
        let money = values.indicativeContribution || values.processingVolume;
        if (money)
          Object.assign(values, {
            amountStatus: money.status,
            amount: money.amount || '',
            currency: money.currency || '',
            period: money.period || '',
          });
      }
      this.answers = values;
    },
    async run(action) {
      if (this.busy) return;
      this.busy = true;
      this.error = '';
      this.errorCode = '';
      try {
        await action();
        this.$nextTick(function () {
          if (this.$refs.stepHeading) this.$refs.stepHeading.focus();
        });
      } catch (e) {
        this.errorCode = e.code || 'unreachable';
        this.error = intake.errorCopy(this.errorCode);
        this.$nextTick(function () {
          if (this.$refs.error) this.$refs.error.focus();
        });
      } finally {
        this.busy = false;
      }
    },
    saveContact() {
      let self = this;
      return this.run(function () {
        return self.controller.capture(self.contact, self.$route.query.source);
      });
    },
    saveAnswers() {
      let self = this;
      return this.run(function () {
        return self.controller.answer(intake.buildQuestionnaire(self.currentAudience, self.answers));
      });
    },
    reopen() {
      let self = this;
      return this.run(async function () {
        await self.controller.resume();
        self.resetAnswers();
      });
    },
    startNew() {
      if (
        !window.confirm(
          'Start a new enquiry? Previously saved information remains with the team. The saved continuation in this browser tab will be removed.',
        )
      )
        return;
      this.controller.clear();
      this.error = '';
      this.contact = {
        name: '',
        email: '',
        organisationName: '',
        country: '',
        interests: [intake.audienceForPath(this.$route.path)].filter(Boolean),
        marketingOptIn: false,
      };
    },
  },
};
</script>

<style scoped>
.outreach-page {
  max-width: 1184px;
  margin: 0 auto;
  padding: 64px 24px 80px;
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 64px;
  color: var(--ix-text);
}
.outreach-intro h1 {
  font-size: clamp(28px, 3vw, 42px);
  line-height: 1.18;
  letter-spacing: -0.025em;
  margin: 20px 0 24px;
  color: var(--ix-text);
}
.outreach-intro > p {
  line-height: 1.7;
  max-width: 42ch;
}
.outreach-eyebrow {
  color: var(--ix-text-dim);
  font-size: 11px;
  letter-spacing: 0.1em;
  margin: 0 0 12px;
}
.outreach-small {
  font-size: 12px;
  color: var(--ix-text-dim);
  line-height: 1.7;
  margin: 12px 0;
}
.outreach-journeys {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
  border-top: 1px solid var(--ix-hairline);
  margin-top: 32px;
  padding-top: 16px;
}
.outreach-journeys a {
  color: var(--ix-text);
  padding: 12px 0;
}
.outreach-form-panel {
  border: 1px solid var(--ix-hairline-strong);
  background: var(--ix-surface);
  padding: 32px;
  min-width: 0;
}
.outreach-form-panel h2 {
  font-size: 22px;
  margin: 0 0 24px;
  color: var(--ix-text);
}
.outreach-form-panel form {
  margin: 0;
}
.outreach-form-panel fieldset {
  border: 0;
  padding: 0;
  margin: 0 0 24px;
  min-width: 0;
}
.outreach-form-panel legend {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}
.outreach-form-panel legend span {
  display: block;
  font-size: 12px;
  font-weight: 400;
  color: var(--ix-text-dim);
  margin-top: 4px;
}
.outreach-form-panel label {
  display: block;
  font-size: 13px;
  line-height: 1.6;
}
.outreach-form-panel label small {
  display: block;
  color: var(--ix-text-dim);
}
.outreach-form-panel input:not([type='checkbox']),
.outreach-form-panel select,
.outreach-form-panel textarea {
  display: block;
  width: 100%;
  min-height: 44px;
  margin-top: 8px;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid var(--ix-hairline-strong);
  border-radius: var(--ix-radius);
  background: var(--ix-bg);
  color: var(--ix-text);
  font: inherit;
}
.outreach-form-panel textarea {
  resize: vertical;
}
.outreach-form-panel input[type='checkbox'] {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  accent-color: var(--ix-orange);
  margin: 3px 0 0;
}
.outreach-interest {
  display: flex !important;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--ix-hairline-strong);
  margin-bottom: 8px;
  cursor: pointer;
}
.outreach-interest.selected {
  border-color: var(--ix-orange);
}
.outreach-interest strong {
  display: block;
  font-size: 14px;
}
.outreach-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin: 24px 0;
}
.outreach-consent {
  display: flex !important;
  gap: 12px;
  align-items: start;
  margin: 12px 0;
  cursor: pointer;
}
.outreach-questions {
  display: grid;
  gap: 24px;
}
.outreach-questions fieldset {
  margin: 0;
}
.outreach-primary,
.outreach-secondary {
  min-height: 44px;
  font: inherit;
  font-size: 13px;
  padding: 12px 16px;
  border: 1px solid var(--ix-hairline-strong);
  cursor: pointer;
  margin-top: 24px;
}
.outreach-primary {
  width: 100%;
  display: flex;
  justify-content: space-between;
  background: var(--ix-orange);
  color: var(--ix-on-accent);
  border-color: var(--ix-orange);
  font-weight: 600;
}
.outreach-secondary {
  background: var(--ix-surface-raised);
  color: var(--ix-text);
}
.outreach-page :focus-visible {
  outline: 2px solid var(--ix-orange);
  outline-offset: 3px;
}
.outreach-page :disabled {
  opacity: 0.65;
  cursor: wait;
}
.outreach-notice {
  padding: 16px;
  border: 1px solid var(--ix-hairline-strong);
  color: var(--ix-text);
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.outreach-saved {
  font-size: 14px;
  line-height: 1.6;
}
.outreach-complete p {
  line-height: 1.7;
}
.outreach-complete ul {
  padding-left: 20px;
  line-height: 2;
  margin-top: 16px;
}
.outreach-form-panel progress {
  width: 100%;
  height: 6px;
  accent-color: var(--ix-orange);
}
.outreach-amount {
  grid-template-columns: 1fr 1fr;
  margin-bottom: 0;
}
.outreach-amount > p {
  grid-column: 1 / -1;
  margin: 0;
}
@media (max-width: 900px) {
  .outreach-page {
    grid-template-columns: 1fr;
    gap: 32px;
    padding-top: 32px;
  }
  .outreach-intro > p {
    max-width: 60ch;
  }
}
@media (max-width: 520px) {
  .outreach-page {
    padding: 24px 16px 48px;
  }
  .outreach-form-panel {
    padding: 20px 16px;
  }
  .outreach-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
