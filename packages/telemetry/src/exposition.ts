/**
 * A STRICT READER FOR THE PROMETHEUS TEXT EXPOSITION FORMAT.
 *
 * ── Why a parser ships next to the renderer ─────────────────────────────────
 *
 * Because the interesting question about a metrics endpoint is never "does the
 * code compile". It is "does the dashboard name a series this thing actually
 * emits", and the only way to answer that without guessing is to READ THE
 * OUTPUT. A test that asserts `render()` contains a substring copied out of
 * `render()` proves the two halves of one file agree with each other; it says
 * nothing about whether Prometheus can read it or whether a panel matches it.
 *
 * So this is the seam that makes those checks possible:
 *
 *   · `metrics.test.ts` renders real samples and parses them back, asserting
 *     bucket monotonicity, `+Inf == _count`, and label round-tripping.
 *   · `svc-edge`'s `observability-wiring.test.ts` drives the live HTTP endpoint,
 *     parses the response body, and asserts every metric named in the committed
 *     Grafana panel appears in it. A panel querying `http_request_duration_
 *     seconds` while the service emits `intafaced_http_request_duration_seconds`
 *     is a green diff and a blank chart, and this is what catches it.
 *
 * It is exported rather than copy-pasted into each suite deliberately. This
 * repo already has a gate (`tooling/ci/skip-honesty-scan.mjs`) that exists
 * because five suites hand-rolled the same eight-line probe and all five got it
 * subtly wrong the same way. One parser, one place.
 *
 * ── On independence ─────────────────────────────────────────────────────────
 *
 * This is written from the exposition grammar, not from `metrics.ts`, so a
 * renderer change that breaks the format fails rather than being followed
 * sympathetically. It is still same-package code, and same-package code can
 * drift together — which is why it is NOT the only check. `promtool check
 * metrics`, the actual Prometheus parser, is run against this module's sibling's
 * real output; see the PR body for the transcript.
 *
 * ── Strict on purpose ───────────────────────────────────────────────────────
 *
 * Every line must parse or this throws. A lenient parser that skips what it
 * does not understand is the worst possible tool here: Prometheus rejects the
 * ENTIRE scrape on a malformed line, so a reader that shrugs at one would
 * report healthy on a payload that produces no series at all.
 */

export interface ParsedSample {
  /** Family name, including any `_bucket` / `_sum` / `_count` suffix. */
  readonly name: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly value: number;
}

export interface ParsedExposition {
  /** `# HELP` docstrings, by family name. */
  readonly help: Readonly<Record<string, string>>;
  /** `# TYPE` declarations, by family name. */
  readonly type: Readonly<Record<string, string>>;
  readonly samples: readonly ParsedSample[];
}

const SAMPLE_LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})? (.+)$/;
const LABEL_PAIR = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;

/** The format escapes exactly three characters in a label value. */
function unescapeLabel(value: string): string {
  return value.replace(/\\(.)/g, (_m, c: string) => (c === 'n' ? '\n' : c));
}

export function parseExposition(text: string): ParsedExposition {
  // Not pedantry. A payload whose final line has no newline is rejected
  // outright, and the target goes DOWN with a parse error that never appears in
  // the service's own logs.
  if (!text.endsWith('\n')) throw new Error('exposition must end with a newline');

  const help: Record<string, string> = {};
  const type: Record<string, string> = {};
  const samples: ParsedSample[] = [];

  for (const line of text.slice(0, -1).split('\n')) {
    if (line === '') continue;

    if (line.startsWith('# HELP ')) {
      const rest = line.slice('# HELP '.length);
      const space = rest.indexOf(' ');
      if (space < 0) throw new Error(`malformed HELP line: ${line}`);
      help[rest.slice(0, space)] = rest.slice(space + 1);
      continue;
    }

    if (line.startsWith('# TYPE ')) {
      const [name, kind, ...extra] = line.slice('# TYPE '.length).split(' ');
      if (!name || !kind || extra.length > 0) throw new Error(`malformed TYPE line: ${line}`);
      type[name] = kind;
      continue;
    }

    if (line.startsWith('#')) continue;

    const m = SAMPLE_LINE.exec(line);
    if (!m) throw new Error(`unparseable sample line: ${line}`);
    const [, name, labelBlob, rawValue] = m;

    const labels: Record<string, string> = {};
    if (labelBlob) {
      const inner = labelBlob.slice(1, -1);
      let consumed = 0;
      LABEL_PAIR.lastIndex = 0;
      let pair: RegExpExecArray | null;
      while ((pair = LABEL_PAIR.exec(inner)) !== null) {
        labels[pair[1] as string] = unescapeLabel(pair[2] as string);
        consumed += pair[0].length;
      }
      // Every character in the block must belong to a pair or be a separating
      // comma. Without this, the parser would silently SKIP whatever it failed
      // to understand — and the real parser would not have.
      const separators = Object.keys(labels).length === 0 ? 0 : Object.keys(labels).length - 1;
      if (consumed + separators !== inner.length) throw new Error(`unparseable label block: ${labelBlob}`);
    }

    // The grammar's sample value is a Go `ParseFloat`: decimal, exponent
    // notation, or one of the three special forms.
    const value = rawValue === '+Inf' ? Infinity : rawValue === '-Inf' ? -Infinity : Number(rawValue);
    if (Number.isNaN(value) && rawValue !== 'NaN') throw new Error(`unparseable sample value: ${rawValue}`);

    samples.push({ name: name as string, labels, value });
  }

  return { help, type, samples };
}

/** Every distinct family name present in a payload. */
export function metricNamesIn(text: string): ReadonlySet<string> {
  return new Set(parseExposition(text).samples.map((s) => s.name));
}
