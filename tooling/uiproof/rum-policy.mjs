/**
 * remaining-SOT §12.6 / §19.7.8 — perf/RUM policy (executable).
 *
 * This file names lab guidance budgets and desk measures. It does not install
 * a collector, ship a vendor SDK, or certify Core Web Vitals.
 *
 * Field RUM is unconfigured and refused until a named collector exists in
 * FIELD_COLLECTOR. Env vars, claim payloads, and @intafaced/telemetry (server
 * OTLP) are not a field collector.
 */

export const POLICY_REFS = Object.freeze(['remaining-SOT §12.6', 'remaining-SOT §19.7.8']);

/** Named states this policy can occupy. */
export const STATES = Object.freeze(['unconfigured', 'lab-guidance-named', 'field-refused', 'malformed-claim-fails']);

/**
 * Lab budgets from remaining-SOT §12.6. Guidance, not a pass claim.
 * Field results would use the 75th percentile, segmented mobile/desktop,
 * only after a named collector exists.
 */
export const LAB_BUDGETS = Object.freeze({
  lcpMs: 2500,
  inpMs: 200,
  cls: 0.1,
  kind: 'guidance',
  fieldPercentile: 75,
  fieldSegments: Object.freeze(['mobile', 'desktop']),
});

/** Desk measures remaining-SOT §12.6 names in addition to CWV guidance. */
export const DESK_MEASURES = Object.freeze([
  'first-honest-book-state',
  'first-accepted-candle',
  'ticket-validation-latency',
  'submit-to-ack-or-unknown',
  'reconnect-duration',
  'update-coalescing',
  'long-animation-frames',
]);

/** No named field collector. Null is the contract. */
export const FIELD_COLLECTOR = null;

/** Third-party RUM vendors this policy refuses. Presence as a dependency is a fail. */
export const FORBIDDEN_RUM_VENDORS = Object.freeze([
  'datadog',
  '@datadog/browser-rum',
  'sentry',
  '@sentry/browser',
  '@sentry/vue',
  'newrelic',
  '@newrelic/browser-agent',
  'logrocket',
  '@elastic/apm-rum',
]);

/** Server OTLP / matcher benches are not browser RUM. */
export const NOT_FIELD_RUM = Object.freeze(['@intafaced/telemetry', 'tooling/perf/book-bench.mjs']);

export const TELEMETRY_OUTCOME_CLASSES = Object.freeze(['client-error', 'service-refusal', 'timeout', 'unknown-write']);

export const TELEMETRY_FORBIDDEN_FIELDS = Object.freeze([
  'persistent-browser-bearer',
  'authorization',
  'bearer',
  'balance',
  'balances',
  'pii',
]);

export function labState() {
  return 'lab-guidance-named';
}

/**
 * Field state is derived only from FIELD_COLLECTOR.
 * Env tokens must not silently become a collector.
 */
export function fieldState(_env = {}) {
  void _env;
  return FIELD_COLLECTOR ? 'field-refused' : 'unconfigured';
}

export function collectorFromEnv(env = {}) {
  void env;
  return FIELD_COLLECTOR;
}

/**
 * Pass claims fail closed. Lab budgets are guidance. Field pass requires
 * FIELD_COLLECTOR, which is null. A caller-supplied collector is ignored.
 */
export function evaluateClaim(claim = {}) {
  const body = claim && typeof claim === 'object' ? claim : {};
  if (body.coreWebVitalsPass === true || body.cwvPass === true || body.lcpPass === true) {
    return Object.freeze({
      ok: false,
      state: 'malformed-claim-fails',
      reason: 'core-web-vitals-are-guidance-not-a-pass',
    });
  }
  if (body.fieldPass === true) {
    return Object.freeze({
      ok: false,
      state: 'malformed-claim-fails',
      reason: 'field-pass-without-collector',
    });
  }
  if (body.collector != null && body.collector !== FIELD_COLLECTOR) {
    return Object.freeze({
      ok: false,
      state: 'malformed-claim-fails',
      reason: 'collector-not-in-policy',
    });
  }
  return Object.freeze({
    ok: false,
    state: fieldState(),
    reason: 'no-named-collector',
  });
}

export function redactCorrelationId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${trimmed.slice(0, 8)}…`;
}

export function classifyOutcome(kind) {
  if (typeof kind !== 'string') return null;
  return TELEMETRY_OUTCOME_CLASSES.includes(kind) ? kind : null;
}

export function telemetryPayloadForbidden(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const hits = [];
  for (const key of Object.keys(payload)) {
    const needle = key.trim().toLowerCase();
    if (TELEMETRY_FORBIDDEN_FIELDS.includes(needle)) hits.push(needle);
  }
  if (typeof payload.authorization === 'string' && payload.authorization.length > 0) {
    if (!hits.includes('authorization')) hits.push('authorization');
  }
  return hits;
}

export function findForbiddenRumVendors(source) {
  if (typeof source !== 'string' || source === '') return [];
  const hits = [];
  for (const vendor of FORBIDDEN_RUM_VENDORS) {
    const escaped = vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const asDep = new RegExp(`["']${escaped}["']\\s*:`, 'i');
    const asImport = new RegExp(`(?:from|require\\()\\s*['"]${escaped}['"]`, 'i');
    if (asDep.test(source) || asImport.test(source)) hits.push(vendor);
  }
  return [...new Set(hits)];
}

/**
 * Unconfigured field hook. send() always refuses while FIELD_COLLECTOR is null.
 * Drops the event; never forwards bearer, balances, or PII.
 */
export function createFieldRumHook(_config = {}) {
  void _config;
  return Object.freeze({
    state: fieldState(),
    collector: FIELD_COLLECTOR,
    send(_event) {
      void _event;
      return Object.freeze({
        ok: false,
        state: 'field-refused',
        reason: 'no-named-collector',
        event: null,
      });
    },
  });
}
