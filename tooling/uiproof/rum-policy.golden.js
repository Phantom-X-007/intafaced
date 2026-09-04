import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESK_MEASURES,
  FIELD_COLLECTOR,
  FORBIDDEN_RUM_VENDORS,
  LAB_BUDGETS,
  NOT_FIELD_RUM,
  POLICY_REFS,
  STATES,
  TELEMETRY_FORBIDDEN_FIELDS,
  TELEMETRY_OUTCOME_CLASSES,
  classifyOutcome,
  collectorFromEnv,
  createFieldRumHook,
  evaluateClaim,
  fieldState,
  findForbiddenRumVendors,
  labState,
  redactCorrelationId,
  telemetryPayloadForbidden,
} from './rum-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

const policySource = readFileSync(join(here, 'rum-policy.mjs'), 'utf8');
const goldenSource = readFileSync(join(here, 'rum-policy.golden.js'), 'utf8');
const configSource = readFileSync(join(here, 'playwright.config.mjs'), 'utf8');
const memberShell = readFileSync(join(root, 'vendor/upstream-exchange/05_Web_Front/index.html'), 'utf8');
const memberPkg = readFileSync(join(root, 'vendor/upstream-exchange/05_Web_Front/package.json'), 'utf8');
const rootPkg = readFileSync(join(root, 'package.json'), 'utf8');

assert.ok(POLICY_REFS.includes('remaining-SOT §12.6'));
assert.ok(POLICY_REFS.includes('remaining-SOT §19.7.8'));
assert.deepEqual([...STATES], ['unconfigured', 'lab-guidance-named', 'field-refused', 'malformed-claim-fails']);

assert.equal(LAB_BUDGETS.lcpMs, 2500);
assert.equal(LAB_BUDGETS.inpMs, 200);
assert.equal(LAB_BUDGETS.cls, 0.1);
assert.equal(LAB_BUDGETS.kind, 'guidance');
assert.equal(LAB_BUDGETS.fieldPercentile, 75);
assert.deepEqual([...LAB_BUDGETS.fieldSegments], ['mobile', 'desktop']);
assert.equal(labState(), 'lab-guidance-named');
assert.match(policySource, /guidance, not a pass claim/i);

assert.deepEqual(
  [...DESK_MEASURES],
  [
    'first-honest-book-state',
    'first-accepted-candle',
    'ticket-validation-latency',
    'submit-to-ack-or-unknown',
    'reconnect-duration',
    'update-coalescing',
    'long-animation-frames',
  ],
);

assert.equal(FIELD_COLLECTOR, null);
assert.equal(fieldState(), 'unconfigured');
assert.equal(fieldState({ SENTRY_DSN: 'https://example', DD_RUM_CLIENT_TOKEN: 'x' }), 'unconfigured');
assert.equal(
  collectorFromEnv({
    SENTRY_DSN: 'https://example',
    DD_RUM_APPLICATION_ID: 'app',
    RUM_COLLECTOR: 'https://rum.example',
  }),
  null,
  'env must not silently become a field collector',
);

assert.deepEqual(evaluateClaim({ coreWebVitalsPass: true }), {
  ok: false,
  state: 'malformed-claim-fails',
  reason: 'core-web-vitals-are-guidance-not-a-pass',
});
assert.deepEqual(evaluateClaim({ cwvPass: true }), {
  ok: false,
  state: 'malformed-claim-fails',
  reason: 'core-web-vitals-are-guidance-not-a-pass',
});
assert.deepEqual(evaluateClaim({ fieldPass: true }), {
  ok: false,
  state: 'malformed-claim-fails',
  reason: 'field-pass-without-collector',
});
assert.deepEqual(evaluateClaim({ fieldPass: true, collector: 'datadog' }), {
  ok: false,
  state: 'malformed-claim-fails',
  reason: 'field-pass-without-collector',
});
assert.deepEqual(evaluateClaim({ collector: 'https://rum.example' }), {
  ok: false,
  state: 'malformed-claim-fails',
  reason: 'collector-not-in-policy',
});
assert.deepEqual(evaluateClaim({}), {
  ok: false,
  state: 'unconfigured',
  reason: 'no-named-collector',
});

const hook = createFieldRumHook({ collector: 'datadog' });
assert.equal(hook.state, 'unconfigured');
assert.equal(hook.collector, null);
assert.deepEqual(hook.send({ name: 'LCP', value: 1, authorization: 'Bearer secret', balances: ['1'] }), {
  ok: false,
  state: 'field-refused',
  reason: 'no-named-collector',
  event: null,
});

assert.deepEqual([...TELEMETRY_OUTCOME_CLASSES], ['client-error', 'service-refusal', 'timeout', 'unknown-write']);
assert.equal(classifyOutcome('client-error'), 'client-error');
assert.equal(classifyOutcome('service-refusal'), 'service-refusal');
assert.equal(classifyOutcome('timeout'), 'timeout');
assert.equal(classifyOutcome('unknown-write'), 'unknown-write');
assert.equal(classifyOutcome('success'), null);
assert.equal(redactCorrelationId('corr-abcd-efgh-ijkl'), 'corr-abc…');
assert.equal(redactCorrelationId(''), null);
assert.ok(redactCorrelationId('corr-abcd-efgh-ijkl').endsWith('…'));
assert.notEqual(redactCorrelationId('corr-abcd-efgh-ijkl'), 'corr-abcd-efgh-ijkl');
assert.ok(TELEMETRY_FORBIDDEN_FIELDS.includes('persistent-browser-bearer'));
assert.ok(TELEMETRY_FORBIDDEN_FIELDS.includes('balances'));
assert.ok(TELEMETRY_FORBIDDEN_FIELDS.includes('pii'));
assert.deepEqual(telemetryPayloadForbidden({ correlationId: 'corr-abcd-efgh-ijkl' }), []);
assert.ok(telemetryPayloadForbidden({ authorization: 'Bearer secret' }).includes('authorization'));
assert.ok(telemetryPayloadForbidden({ balances: ['1.00'] }).includes('balances'));
assert.ok(telemetryPayloadForbidden({ pii: { email: 'a@b.c' } }).includes('pii'));
assert.ok(telemetryPayloadForbidden({ bearer: 'abc' }).includes('bearer'));

assert.ok(FORBIDDEN_RUM_VENDORS.includes('datadog'));
assert.ok(FORBIDDEN_RUM_VENDORS.includes('sentry'));
assert.ok(NOT_FIELD_RUM.includes('@intafaced/telemetry'));
assert.deepEqual(findForbiddenRumVendors(memberPkg), []);
assert.deepEqual(findForbiddenRumVendors(memberShell), []);
assert.deepEqual(findForbiddenRumVendors(rootPkg), []);
assert.deepEqual(findForbiddenRumVendors(configSource), []);
assert.deepEqual(findForbiddenRumVendors(policySource), [], 'policy must not import a RUM vendor SDK');
assert.deepEqual(findForbiddenRumVendors('{"@sentry/browser": "8.0.0"}'), ['@sentry/browser'], 'golden must fail a vendor SDK dependency');
assert.deepEqual(findForbiddenRumVendors('{"@datadog/browser-rum": "5.0.0"}'), ['@datadog/browser-rum']);
assert.doesNotMatch(
  memberShell,
  /datadoghq-browser-agent|browser\.sentry-cdn|js-agent\.newrelic|cdn\.logrocket\.io/i,
  'member shell must not load a RUM vendor CDN',
);

assert.doesNotMatch(policySource, /from ['"]@sentry|from ['"]@datadog|from ['"]newrelic/);
assert.doesNotMatch(policySource, /core web vitals pass/i);
assert.doesNotMatch(goldenSource, /coreWebVitalsPass:\s*true[\s\S]{0,80}ok:\s*true/);
assert.match(configSource, /rum-policy\.mjs/);
assert.doesNotMatch(
  configSource,
  /core web vitals (passed|certified)|field rum (passed|enabled|collecting)/i,
  'playwright config must not claim CWV/field pass',
);
assert.doesNotMatch(memberShell, /sentry|datadog|newrelic|logrocket/i);

console.log('uiproof rum-policy: ok');
