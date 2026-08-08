export { startTelemetry, registerProcessHooks, isTelemetryActive } from './start.js';
export type { TelemetryOptions, TelemetryHandle } from './start.js';

export {
  Metrics,
  statusClass,
  methodLabel,
  DURATION_BUCKETS,
  METRIC_FAMILIES,
  EMITTED_LABEL_NAMES,
  PROMETHEUS_CONTENT_TYPE,
  REQUESTS_TOTAL,
  REQUEST_DURATION_SECONDS,
  MODULE_LOCAL,
  MODULE_UNROUTED,
  MODULE_OVERFLOW,
} from './metrics.js';
export type { HttpRequestLabels } from './metrics.js';

export { parseExposition, metricNamesIn } from './exposition.js';
export type { ParsedExposition, ParsedSample } from './exposition.js';
