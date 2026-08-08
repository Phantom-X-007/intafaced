import type { EventDef, EventName, EventCatalog } from './catalog.js';
import { EVENT_CATALOG } from './catalog.js';
import { createEnvelope, type Envelope } from './envelope.js';
import type { z } from 'zod';

/**
 * The bus interface every service codes against. Implementations: JetStream
 * (prod/dev) and in-memory (tests). No service imports `nats` directly.
 */

export type Payload<K extends EventName> = z.infer<EventCatalog[K]['schema']>;

export interface PublishOptions {
  /**
   * Dedupe key. Defaults to the envelope id, which makes the publish
   * at-least-once but not idempotent — pass a business key (order id, tx id)
   * whenever one exists.
   */
  idempotencyKey?: string;
  traceparent?: string;
  causationId?: string;
  correlationId?: string;
  occurredAt?: Date;
}

export interface Handler<K extends EventName> {
  (payload: Payload<K>, envelope: Envelope<Payload<K>>): Promise<void> | void;
}

export interface SubscribeOptions {
  /** Durable consumer name. Required for JetStream — this is what survives restarts. */
  durable: string;
  /**
   * How many times JetStream may deliver this message before it gives up.
   *
   * There is NO dead-letter subject. This used to say there was; the phrase
   * appeared once in this repo, in that sentence, and nothing implemented it.
   * What actually happens on the last failed attempt is that redelivery stops
   * and the message stays in the stream, unacked, for the stream's 90-day
   * retention — recoverable by resetting the durable consumer, and reachable by
   * nothing automatic.
   *
   * Because that state is invisible from the outside, the bus prints one
   * structured `bus.message_abandoned` error as it happens, naming the subject,
   * the durable, the producer and the envelope's idempotency key. It is a
   * signal, not a queue: if a subject needs its failures handled rather than
   * announced, that is a subject in the catalog and a consumer for it.
   */
  maxDeliver?: number;
  signal?: AbortSignal;
}

export interface Subscription {
  unsubscribe(): Promise<void>;
}

export interface EventBus {
  publish<K extends EventName>(name: K, payload: Payload<K>, opts?: PublishOptions): Promise<Envelope<Payload<K>>>;
  subscribe<K extends EventName>(name: K, handler: Handler<K>, opts: SubscribeOptions): Promise<Subscription>;
  close(): Promise<void>;
}

export class EventValidationError extends Error {
  constructor(
    readonly subject: string,
    readonly issues: readonly string[],
  ) {
    super(`Payload rejected for "${subject}":\n  - ${issues.join('\n  - ')}`);
    this.name = 'EventValidationError';
  }
}

/**
 * A field crossed the bus and the schema on this side does not know it.
 *
 * THE FAILURE THIS EXISTS FOR
 *
 * `z.object()` STRIPS unknown keys. It does not warn, it does not record, it
 * returns an object with the key gone and `success: true`. So a consumer built
 * against an older `packages/events` receives a payload, passes validation, and
 * runs its handler on a payload with a field silently deleted.
 *
 * That is how `orderFilled` "dropped account ids": nothing was broken, nothing
 * logged, `makerAccountId` was simply not there. The producer and the consumer
 * never disagreed out loud, because zod resolved the disagreement in favour of
 * the older side and said nothing. An engineer lost a day to it, and the field
 * in question identifies whose money a fill settles against.
 *
 * `version` does NOT catch this. `makerAccountId` was added as `.optional()` at
 * version 1 — an additive change, correctly not a version bump — so a version
 * comparison would have agreed the two sides matched while one of them was
 * deleting a field the other sent.
 */
export class EventSchemaDriftError extends Error {
  constructor(
    readonly subject: string,
    readonly producer: string,
    readonly dropped: readonly string[],
  ) {
    super(
      `Schema drift on "${subject}" from producer "${producer}": this build's schema does not declare ` +
        `${dropped.map((k) => `"${k}"`).join(', ')}, so validation would have DROPPED ` +
        `${dropped.length === 1 ? 'it' : 'them'} silently. Refused instead. ` +
        `Rebuild @intafaced/events and this service against the same catalog (a stale dist is the usual cause).`,
    );
    this.name = 'EventSchemaDriftError';
  }
}

/** The envelope announces a payload version this build does not speak. */
export class EventVersionMismatchError extends Error {
  constructor(
    readonly subject: string,
    readonly producer: string,
    readonly envelopeVersion: number,
    readonly catalogVersion: number,
  ) {
    super(
      `Version mismatch on "${subject}" from producer "${producer}": envelope is v${envelopeVersion}, ` +
        `this build's catalog is v${catalogVersion}. The catalog holds exactly ONE schema per subject, ` +
        `so there is no schema here that can read v${envelopeVersion} — parsing it would be a guess. Refused.`,
    );
    this.name = 'EventVersionMismatchError';
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Every path present in `raw` and absent from `parsed` — i.e. every field the
 * schema threw away.
 *
 * Recursive, because the expensive version of this bug is nested: an entry in
 * `ledgerTxPosted.entries[]` losing its `accountId` is a money-adjacent id
 * vanishing from a double-entry line, and a top-level-only check would call
 * that payload clean.
 *
 * Only ever reports LOSS. A key that zod added (a default) is not drift, and a
 * shape zod restructured is skipped rather than guessed at — this returns
 * nothing unless it can compare like with like.
 */
export function droppedPaths(raw: unknown, parsed: unknown, prefix = ''): string[] {
  const out: string[] = [];

  if (isPlainObject(raw) && isPlainObject(parsed)) {
    for (const key of Object.keys(raw)) {
      const path = prefix ? `${prefix}.${key}` : key;
      // `undefined` was never carried: JSON.stringify drops it on the wire, so
      // an explicit `{ x: undefined }` is not a field the other side sent.
      if (raw[key] === undefined) continue;
      if (!(key in parsed)) out.push(path);
      else out.push(...droppedPaths(raw[key], parsed[key], path));
    }
    return out;
  }

  if (Array.isArray(raw) && Array.isArray(parsed) && raw.length === parsed.length) {
    for (let i = 0; i < raw.length; i++) out.push(...droppedPaths(raw[i], parsed[i], `${prefix}[${i}]`));
  }

  return out;
}

/**
 * Validate a payload against its catalog schema. Called on BOTH publish and
 * consume: a producer cannot emit garbage, and a consumer cannot be poisoned by
 * a producer running an older build.
 *
 * Refuses a payload carrying fields this build's schema does not declare,
 * rather than returning it with those fields quietly removed. See
 * `EventSchemaDriftError` — the silence is the bug, not the extra field.
 *
 * WHY REFUSE RATHER THAN REPORT AND CONTINUE
 *
 * In a general-purpose bus, tolerating unknown keys is right: producers you do
 * not control ship ahead of you and forward compatibility is the whole point.
 * This bus has no such producer. Every publisher and every consumer is in this
 * monorepo, built by one `turbo run build` and deployed from one image, so a
 * consumer meeting a key it does not know ALWAYS means a stale build or a
 * half-finished deploy. There is no honest case where it means "someone
 * upstream is newer than me and that is fine".
 *
 * Nothing is lost by refusing. On JetStream a refusal is a nak: the stream
 * retains 90 days, the message is redelivered, and it lands the moment the
 * stale side is rebuilt. Stripping, by contrast, acks the message — the field
 * is gone from a payload that will never be delivered again.
 *
 * `producer` is threaded through only so the error can name which side is out
 * of step. An error that says "somebody is stale" is a search; one that says
 * "svc-matching is ahead of you on makerAccountId" is a fix.
 */
export function validatePayload<K extends EventName>(name: K, payload: unknown, producer = 'unknown'): Payload<K> {
  const def = EVENT_CATALOG[name] as EventDef;
  const result = def.schema.safeParse(payload);
  if (!result.success) {
    throw new EventValidationError(
      def.subject,
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }

  const dropped = droppedPaths(payload, result.data);
  if (dropped.length > 0) throw new EventSchemaDriftError(def.subject, producer, dropped);

  return result.data as Payload<K>;
}

/**
 * The consume-side gate: version, then schema, then drift.
 *
 * Both bus implementations route every delivery through this, so a consumer
 * cannot opt out of the check by being written carelessly.
 */
export function acceptEnvelope<K extends EventName>(name: K, envelope: Envelope): Payload<K> {
  const def = EVENT_CATALOG[name] as EventDef;
  if (envelope.version !== def.version) {
    throw new EventVersionMismatchError(def.subject, envelope.producer, envelope.version, def.version);
  }
  return validatePayload(name, envelope.payload, envelope.producer);
}

export function buildEnvelope<K extends EventName>(
  name: K,
  payload: Payload<K>,
  producer: string,
  opts: PublishOptions = {},
): Envelope<Payload<K>> {
  const def = EVENT_CATALOG[name] as EventDef;
  // Producer side too. A publisher handing over a key its OWN catalog does not
  // declare is the same silent deletion seen from the other end — usually a
  // typo, or a wider internal object spread into a narrower event.
  const validated = validatePayload(name, payload, producer);
  const env = createEnvelope<Payload<K>>({
    subject: def.subject,
    version: def.version,
    producer,
    idempotencyKey: opts.idempotencyKey ?? crypto.randomUUID(),
    payload: validated,
    ...(opts.occurredAt ? { occurredAt: opts.occurredAt } : {}),
    ...(opts.traceparent ? { traceparent: opts.traceparent } : {}),
    ...(opts.causationId ? { causationId: opts.causationId } : {}),
    ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
  });
  return env;
}

/**
 * Idempotency guard — §10: "consumers idempotent".
 *
 * Wrap a handler so a redelivered envelope is a no-op. The default store is
 * in-memory (fine for tests and single-instance dev); services pass a Redis or
 * Postgres-backed store in prod so dedupe survives a restart and spans replicas.
 */
export interface SeenStore {
  /** Returns true if this key was already processed; marks it otherwise. */
  checkAndSet(key: string): Promise<boolean>;
  /**
   * Un-mark a key whose handler threw, so a redelivery genuinely re-runs it.
   *
   * Optional so an existing store keeps compiling — but a store without it
   * turns `idempotent()` back into at-most-once for that subscription, which is
   * the defect documented on `idempotent` below.
   */
  release?(key: string): Promise<void>;
}

export class MemorySeenStore implements SeenStore {
  private readonly seen = new Set<string>();
  constructor(private readonly max = 100_000) {}

  async checkAndSet(key: string): Promise<boolean> {
    if (this.seen.has(key)) return true;
    if (this.seen.size >= this.max) {
      // Bounded: drop the oldest insertion (Set preserves insertion order).
      const oldest = this.seen.values().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    this.seen.add(key);
    return false;
  }

  async release(key: string): Promise<void> {
    this.seen.delete(key);
  }
}

/**
 * MARK ON SUCCESS, NOT ON ARRIVAL.
 *
 * `checkAndSet` marks the key before the handler runs, so a handler that threw
 * had already been recorded as processed. JetStream redelivers, the wrapper
 * sees the mark, returns early — and the message is ACKED without the handler
 * ever having succeeded. `idempotent()` was at-MOST-once, and silently so.
 *
 * That defeated behaviour every caller had written down as deliberate. The
 * clearest is `svc-identity/src/events.ts`, whose header explains that an XP
 * award for an unknown user raises an FK violation "which throws, which NAKs,
 * which parks the message after `max_deliver`", and calls that "the whole point
 * of this consumer" — the alternative being that "XP silently vanishes, which
 * is precisely the failure this wiring exists to end". The first redelivery was
 * swallowed here, so nothing ever parked and the XP did vanish.
 *
 * Releasing on failure restores it: the key is held only while the handler is
 * in flight and for the life of a success, so a redelivery after a throw
 * genuinely re-runs and can fail its way to the dead-letter as designed. The
 * in-flight window is the point of the mark and stays; nothing else changes.
 */
export function idempotent<K extends EventName>(handler: Handler<K>, store: SeenStore, scope: string): Handler<K> {
  return async (payload, envelope) => {
    const key = `${scope}:${envelope.subject}:${envelope.idempotencyKey}`;
    if (await store.checkAndSet(key)) return;
    try {
      await handler(payload, envelope);
    } catch (err) {
      await store.release?.(key);
      throw err;
    }
  };
}
