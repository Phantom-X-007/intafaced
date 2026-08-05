import { createHash } from 'node:crypto';

/**
 * PAYMENT INSTRUMENTS — the shape, the rules, and none of the I/O (§6.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 *
 * svc-p2p could lock escrow, release it, refund it and adjudicate a dispute —
 * and a trade still could not complete, because at the moment the buyer has to
 * pay the seller there was nowhere to send the money. The escrow machinery was
 * real; the payment leg was a `method` string and a `terms` paragraph.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE FIELDS ARE DATA AND NOT CODE
 *
 * What a payer needs in order to actually send money differs by method and by
 * country, and it is not our knowledge to invent. A hardcoded list of methods
 * with hardcoded field names would be this repo asserting, in code, what a
 * bank transfer requires in Nigeria or what a mobile-money handle looks like in
 * Kenya — assertions no one here is entitled to make, and which would be wrong
 * silently rather than loudly.
 *
 * So a **method schema** is an operator-supplied record: a method id, a country,
 * a display label, and the list of fields that method needs in that country.
 * This file validates instrument details *against* whatever schema the operator
 * registered. It contains no method, no bank, no country's requirements, and
 * shipping it seeds none — an operator with `admin:compliance` registers what a
 * market actually requires, and until they do, that market cannot be used.
 *
 * That refusal is the honest behaviour. The alternative — guessing a plausible
 * field list so the feature "works" — produces instruments that look complete
 * and cannot be paid.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS NOT HERE
 *
 * No money. An instrument is a destination, never a balance (Doctrine §0.6);
 * nothing in this file has an `Amount` and nothing in it can.
 */

// ── The operator's half: what a method needs, per country ────────────────────

/** How a value is compared, when the operator wants more than "not empty". */
export interface FieldSpec {
  /** Machine key. Stable, lowercase, `[a-z0-9_]`. The payload is keyed on it. */
  readonly key: string;
  /** What the payer/owner is shown. Operator-supplied — never derived here. */
  readonly label: string;
  readonly required: boolean;
  /**
   * Anchored automatically. Operator-supplied, so it is capped in length and
   * run only against a capped value: a pattern is arbitrary code with a
   * pathological worst case, and the input it runs against comes from the
   * internet.
   */
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  /**
   * A hint for the input control, NOT an access-control decision. Nothing in
   * this service decides who may read a value by looking at this flag —
   * `instrument-service.ts` decides that from the trade, and it treats every
   * field as sensitive.
   */
  readonly sensitive?: boolean;
  readonly help?: string;
}

export interface MethodSchema {
  readonly methodId: string;
  /** ISO 3166-1 alpha-2, or `*` for "this method works the same everywhere". */
  readonly country: string;
  readonly label: string;
  readonly fields: readonly FieldSpec[];
  readonly enabled: boolean;
}

/** Country wildcard. A schema registered against it applies to every country. */
export const ANY_COUNTRY = '*';

/** Caps. Both halves of "an operator regex meets a stranger's input". */
export const MAX_PATTERN_LENGTH = 200;
export const MAX_VALUE_LENGTH = 512;
export const MAX_FIELDS = 24;
export const MAX_LABEL_LENGTH = 120;

export type InstrumentErrorCode =
  | 'p2p.instrument_schema_invalid'
  | 'p2p.instrument_method_unknown'
  | 'p2p.instrument_method_disabled'
  | 'p2p.instrument_field_missing'
  | 'p2p.instrument_field_undeclared'
  | 'p2p.instrument_field_invalid'
  | 'p2p.instrument_country_invalid'
  | 'p2p.instrument_not_found'
  | 'p2p.instrument_slot_taken'
  | 'p2p.take_refused';

export class InstrumentError extends Error {
  constructor(
    message: string,
    readonly code: InstrumentErrorCode,
    /** Which field, when the answer is one field. Never carries a VALUE. */
    readonly field?: string,
  ) {
    super(message);
    this.name = 'InstrumentError';
  }
}

/**
 * THE ONE REFUSAL A TAKE GETS WHEN THE PAYMENT METHOD IS THE PROBLEM.
 *
 * It is a constant, and every word of it is chosen for what it does NOT say.
 *
 * `attachToTrade` used to throw
 *   `The seller has no active "${methodId}" destination for ${fiatCurrency}`
 * and the router returned `err.message` verbatim as a `BAD_REQUEST`. The throw
 * sits inside the reserve transaction, so a failed take rolls back cleanly — no
 * trade row, no inventory decrement, no escrow, nothing to clean up — and
 * `logDenied` was not called on that path, so it wrote no access-log row.
 *
 * Each take attempt was therefore a **free, unlogged, self-describing
 * confirm/deny** for "does seller S hold an instrument for method M in currency
 * C", with `instruments.methods.list` handing any authenticated caller the
 * candidate list to enumerate against. It answered a question about someone
 * else's bank accounts, for nothing, and left no trace it had been asked.
 *
 * Two things close it, and they are the two the ADR names:
 *
 *   · this message, which does not distinguish "no such instrument" from any
 *     other reason the take could not name a destination — same code, same
 *     text, same shape;
 *   · the access-log row every such refusal now writes, so the attempt is
 *     attributable and lands in the OWNER's own access log, like every other
 *     read of instrument existence.
 *
 * WHAT THIS DOES NOT CLOSE, stated plainly rather than implied: an offer
 * publishes its `methods`, so a caller who takes against a method the offer
 * DOES list and is refused can still infer the instrument is missing. That
 * residual is offer-side, not instrument-side, and the fix for it is
 * offer-side too — an offer whose seller has no live destination for a method
 * should not advertise that method. That is a change to the board query and
 * belongs in its own PR; it is not smuggled in here.
 */
export const TAKE_REFUSED_MESSAGE = 'This offer cannot be taken with the selected payment method';

export function takeRefused(): InstrumentError {
  return new InstrumentError(TAKE_REFUSED_MESSAGE, 'p2p.take_refused');
}

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const METHOD_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

/**
 * Country code shape only.
 *
 * Deliberately NOT a list of countries we serve: `packages/config` owns
 * jurisdiction, and a second, quietly-diverging list of country codes in a P2P
 * service is exactly the kind of duplicate truth §0.3 is about. This checks the
 * value is an ISO 3166-1 alpha-2 shape (or the wildcard) and nothing more.
 */
export function normaliseCountry(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (value === ANY_COUNTRY) return ANY_COUNTRY;
  if (!COUNTRY_RE.test(value)) {
    throw new InstrumentError(`"${raw}" is not an ISO 3166-1 alpha-2 country code`, 'p2p.instrument_country_invalid');
  }
  return value;
}

export function normaliseMethodId(raw: string): string {
  const value = methodIdKey(raw);
  if (!METHOD_ID_RE.test(value)) {
    throw new InstrumentError(
      `"${raw}" is not a usable method id — lowercase letters, digits, "_" and "-", starting with a letter`,
      'p2p.instrument_schema_invalid',
    );
  }
  return value;
}

/**
 * THE ONE RULE FOR COMPARING TWO METHOD IDS. Case and padding are not meaning.
 *
 * Every write path stores a method id through `normaliseMethodId`, so what is
 * in the database is always lowercase. The read paths did not all agree: an
 * offer's `methods` array is stored verbatim from the maker, and a taker sends
 * back whatever the offer showed them. A maker who declared `"Bank_Transfer"`
 * therefore produced a take carrying `Bank_Transfer` and a stored instrument
 * keyed `bank_transfer` — and the lookup, comparing them exactly, told the
 * seller they had no destination while holding it.
 *
 * That is why this is a separate function from `normaliseMethodId` rather than
 * a call to it: a COMPARISON must not throw. The strings being compared here
 * arrive from a stranger taking an offer, and an id that could never name an
 * instrument has to fall through to the ordinary "no such destination" refusal
 * — not become a schema-validation error that distinguishes itself from it.
 *
 * Registration (`normaliseMethodId`) is where a malformed id is refused, in
 * front of the operator who typed it.
 */
export function methodIdKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Validate an operator's field list before it is stored.
 *
 * A bad schema is worse than no schema: it is accepted once and then rejects
 * every instrument a real user tries to register, at a point where the user
 * cannot tell whether they typed something wrong or we did.
 */
export function parseFieldSpecs(raw: unknown): FieldSpec[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new InstrumentError('A method schema needs at least one field', 'p2p.instrument_schema_invalid');
  }
  if (raw.length > MAX_FIELDS) {
    throw new InstrumentError(`A method schema may declare at most ${MAX_FIELDS} fields`, 'p2p.instrument_schema_invalid');
  }

  const seen = new Set<string>();
  const specs: FieldSpec[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new InstrumentError('Each field must be an object', 'p2p.instrument_schema_invalid');
    }
    const f = entry as Record<string, unknown>;

    const key = typeof f.key === 'string' ? f.key.trim().toLowerCase() : '';
    if (!KEY_RE.test(key)) {
      throw new InstrumentError(`"${String(f.key)}" is not a usable field key`, 'p2p.instrument_schema_invalid');
    }
    if (seen.has(key)) {
      throw new InstrumentError(`Field "${key}" is declared twice`, 'p2p.instrument_schema_invalid', key);
    }
    seen.add(key);

    const label = typeof f.label === 'string' ? f.label.trim() : '';
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      throw new InstrumentError(`Field "${key}" needs a label of 1–${MAX_LABEL_LENGTH} characters`, 'p2p.instrument_schema_invalid', key);
    }

    const spec: {
      key: string;
      label: string;
      required: boolean;
      pattern?: string;
      minLength?: number;
      maxLength?: number;
      sensitive?: boolean;
      help?: string;
    } = { key, label, required: f.required !== false };

    if (f.pattern !== undefined) {
      if (typeof f.pattern !== 'string' || f.pattern.length === 0 || f.pattern.length > MAX_PATTERN_LENGTH) {
        throw new InstrumentError(
          `Field "${key}" has a pattern that is empty or longer than ${MAX_PATTERN_LENGTH}`,
          'p2p.instrument_schema_invalid',
          key,
        );
      }
      try {
        // Compiled now so a broken pattern fails at registration, in front of
        // the operator, rather than at every user's first attempt to save.
        new RegExp(f.pattern, 'u');
      } catch {
        throw new InstrumentError(
          `Field "${key}" has a pattern that is not a valid regular expression`,
          'p2p.instrument_schema_invalid',
          key,
        );
      }
      spec.pattern = f.pattern;
    }

    const bounds = readBounds(f, key);
    if (bounds.minLength !== undefined) spec.minLength = bounds.minLength;
    if (bounds.maxLength !== undefined) spec.maxLength = bounds.maxLength;

    if (f.sensitive !== undefined) spec.sensitive = f.sensitive === true;
    if (typeof f.help === 'string' && f.help.trim().length > 0) spec.help = f.help.trim().slice(0, 400);

    specs.push(spec);
  }

  return specs;
}

function readBounds(f: Record<string, unknown>, key: string): { minLength?: number; maxLength?: number } {
  const out: { minLength?: number; maxLength?: number } = {};

  for (const name of ['minLength', 'maxLength'] as const) {
    const value = f[name];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_VALUE_LENGTH) {
      throw new InstrumentError(`Field "${key}" has a ${name} outside 1–${MAX_VALUE_LENGTH}`, 'p2p.instrument_schema_invalid', key);
    }
    out[name] = value;
  }

  if (out.minLength !== undefined && out.maxLength !== undefined && out.minLength > out.maxLength) {
    throw new InstrumentError(`Field "${key}" has minLength above maxLength`, 'p2p.instrument_schema_invalid', key);
  }
  return out;
}

// ── The user's half: the details themselves ──────────────────────────────────

export type InstrumentDetails = Readonly<Record<string, string>>;

/**
 * Validate what the owner typed against what the operator declared.
 *
 * Two refusals matter more than the rest:
 *
 *   · **an undeclared key is rejected**, not ignored. Silently dropping unknown
 *     keys would let a client push arbitrary personal data into a blob nobody
 *     designed, that nobody validates, and that then has to be protected and
 *     eventually deleted like the rest of it. Storing exactly the declared
 *     fields is what makes "what personal data do we hold" answerable.
 *   · **a required field that is present but blank is missing**, because a
 *     payer cannot send money to a whitespace string any more than to a null.
 */
export function validateDetails(schema: MethodSchema, raw: unknown): InstrumentDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InstrumentError('Instrument details must be an object of field values', 'p2p.instrument_field_invalid');
  }

  const declared = new Map(schema.fields.map((f) => [f.key, f]));
  const input = raw as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!declared.has(key)) {
      throw new InstrumentError(
        `"${schema.methodId}" in ${schema.country} declares no field "${key}"`,
        'p2p.instrument_field_undeclared',
        key,
      );
    }
  }

  const out: Record<string, string> = {};

  for (const field of schema.fields) {
    const value = input[field.key];

    if (value === undefined || value === null || value === '') {
      if (field.required) {
        throw new InstrumentError(`"${field.label}" is required`, 'p2p.instrument_field_missing', field.key);
      }
      continue;
    }

    if (typeof value !== 'string') {
      throw new InstrumentError(`"${field.label}" must be text`, 'p2p.instrument_field_invalid', field.key);
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      if (field.required) throw new InstrumentError(`"${field.label}" is required`, 'p2p.instrument_field_missing', field.key);
      continue;
    }
    if (trimmed.length > MAX_VALUE_LENGTH) {
      throw new InstrumentError(
        `"${field.label}" is longer than ${MAX_VALUE_LENGTH} characters`,
        'p2p.instrument_field_invalid',
        field.key,
      );
    }
    if (field.minLength !== undefined && trimmed.length < field.minLength) {
      throw new InstrumentError(
        `"${field.label}" is shorter than ${field.minLength} characters`,
        'p2p.instrument_field_invalid',
        field.key,
      );
    }
    if (field.maxLength !== undefined && trimmed.length > field.maxLength) {
      throw new InstrumentError(`"${field.label}" is longer than ${field.maxLength} characters`, 'p2p.instrument_field_invalid', field.key);
    }
    if (field.pattern !== undefined && !anchored(field.pattern).test(trimmed)) {
      // The message names the field and never the value: an error string is the
      // one place personal data escapes into logs without anyone deciding to.
      throw new InstrumentError(`"${field.label}" is not in the expected format`, 'p2p.instrument_field_invalid', field.key);
    }

    out[field.key] = trimmed;
  }

  return Object.freeze(out);
}

/** Whole-value match. A half-anchored operator pattern is not a validation. */
function anchored(pattern: string): RegExp {
  const body = pattern.replace(/^\^/, '').replace(/\$$/, '');
  return new RegExp(`^(?:${body})$`, 'u');
}

/**
 * A stable identifier for "which account is this", derived from the values.
 *
 * Kept for two things the values themselves cannot be kept for:
 *
 *   1. after the retention purge wipes a closed trade's snapshot, the
 *      fingerprint still answers "was the buyer shown the same account the
 *      seller claims" in an appeal — without us still holding the account;
 *   2. it makes an edit visible. Two snapshots with different fingerprints on
 *      one seller's trades are a seller who changed destination, which is the
 *      shape of the mid-trade account swap.
 *
 * SHA-256 over canonical JSON — sorted keys, so key order cannot change it.
 */
export function fingerprintDetails(methodId: string, country: string, details: InstrumentDetails): string {
  const canonical = JSON.stringify(
    Object.keys(details)
      .sort()
      .map((k) => [k, details[k]]),
  );
  return createHash('sha256').update(`${methodId} ${country} ${canonical}`).digest('hex');
}

/**
 * Which schema applies to an instrument in a country.
 *
 * Exact country beats the wildcard, always. A method that has been given a
 * country-specific field list in NG must not fall back to the generic one there
 * just because the generic one also exists — the specific list is the operator
 * saying "this market is different", and silently ignoring that is how a
 * complete-looking instrument turns out to be unpayable.
 */
export function pickSchema(schemas: readonly MethodSchema[], methodId: string, country: string): MethodSchema | null {
  const forMethod = schemas.filter((s) => s.methodId === methodId);
  return forMethod.find((s) => s.country === country) ?? forMethod.find((s) => s.country === ANY_COUNTRY) ?? null;
}
