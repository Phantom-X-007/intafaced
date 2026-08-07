import { connect, type NatsConnection, type JetStreamClient, type JetStreamManager, RetentionPolicy, AckPolicy, DeliverPolicy } from 'nats';
import type { ModuleId } from '@intafaced/config';
import { EVENT_CATALOG, type EventDef, type EventName } from './catalog.js';
import { streamName, wildcard } from './subject.js';
import { decodeEnvelope, encodeEnvelope, type Envelope } from './envelope.js';
import {
  acceptEnvelope,
  buildEnvelope,
  type EventBus,
  type Handler,
  type Payload,
  type PublishOptions,
  type SubscribeOptions,
  type Subscription,
} from './bus.js';

/**
 * NATS JetStream implementation of the bus.
 *
 * Streams are per-service (`INTAFACED_LEDGER` carries `intafaced.ledger.>`),
 * so a service's event history can be replayed, retained, or purged on its own
 * terms — §10: "event sourcing where money moves ... replayable by design".
 *
 * Publishes use JetStream's `msgID` for server-side dedupe inside the dedupe
 * window; the consumer-side `idempotent()` wrapper covers everything beyond it.
 */

export interface JetStreamBusOptions {
  servers: string;
  /** The service publishing — becomes envelope.producer. */
  producer: string;
  streamPrefix?: string;
  /** Services whose streams this process is responsible for creating. */
  ownedStreams?: readonly ModuleId[];
  name?: string;
}

export class JetStreamEventBus implements EventBus {
  private constructor(
    private readonly nc: NatsConnection,
    private readonly js: JetStreamClient,
    private readonly jsm: JetStreamManager,
    private readonly opts: Required<Pick<JetStreamBusOptions, 'producer' | 'streamPrefix'>>,
    private readonly subs: Subscription[] = [],
  ) {}

  static async connect(opts: JetStreamBusOptions): Promise<JetStreamEventBus> {
    const nc = await connect({ servers: opts.servers, name: opts.name ?? opts.producer });
    const jsm = await nc.jetstreamManager();
    const js = nc.jetstream();
    const prefix = opts.streamPrefix ?? 'INTAFACED';

    for (const service of opts.ownedStreams ?? []) {
      await ensureStream(jsm, service, prefix);
    }

    return new JetStreamEventBus(nc, js, jsm, { producer: opts.producer, streamPrefix: prefix });
  }

  async publish<K extends EventName>(name: K, payload: Payload<K>, opts: PublishOptions = {}): Promise<Envelope<Payload<K>>> {
    const def = EVENT_CATALOG[name] as EventDef;
    const env = buildEnvelope(name, payload, this.opts.producer, opts);
    await this.js.publish(def.subject, encodeEnvelope(env as Envelope), { msgID: env.idempotencyKey });
    return env;
  }

  async subscribe<K extends EventName>(name: K, handler: Handler<K>, opts: SubscribeOptions): Promise<Subscription> {
    const def = EVENT_CATALOG[name] as EventDef;
    const stream = streamName(def.service, this.opts.streamPrefix);

    await this.jsm.consumers.add(stream, {
      durable_name: opts.durable,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: DeliverPolicy.All,
      filter_subject: def.subject,
      max_deliver: opts.maxDeliver ?? 5,
      ack_wait: 30_000_000_000, // 30s in ns
    });

    const consumer = await this.js.consumers.get(stream, opts.durable);
    const messages = await consumer.consume();

    let stopped = false;
    const pump = (async () => {
      for await (const msg of messages) {
        if (stopped) break;
        try {
          const env = decodeEnvelope(msg.data);
          // Version, schema, and drift. A message carrying a field this build
          // cannot name is NAK'd rather than delivered with the field removed —
          // see `EventSchemaDriftError`. The stream retains it for 90 days, so
          // a rebuild is all that stands between the refusal and delivery.
          const validated = acceptEnvelope(name, env);
          await handler(validated, env as Envelope<Payload<K>>);
          msg.ack();
        } catch (err) {
          // Redelivery is JetStream's job; after max_deliver the message is
          // parked for the operator. Never ack a message we failed to process.
          //
          // The delay is the difference between retrying and only appearing to.
          // A bare `nak()` redelivers immediately, so the default budget of five
          // attempts against a gateway returning 503 was spent inside a few
          // milliseconds and the message parked before the blip it was meant to
          // ride out had finished. svc-notify says a transient failure MUST be
          // retried; three attempts in five milliseconds is not a retry.
          msg.nak(nakBackoffMs(msg.info.redeliveryCount));
          if (!(err instanceof Error)) throw err;
        }
      }
    })();

    const sub: Subscription = {
      unsubscribe: async () => {
        stopped = true;
        messages.stop();
        await pump.catch(() => undefined);
      },
    };

    if (opts.signal) opts.signal.addEventListener('abort', () => void sub.unsubscribe(), { once: true });
    this.subs.push(sub);
    return sub;
  }

  async close(): Promise<void> {
    await Promise.all(this.subs.map((s) => s.unsubscribe()));
    await this.nc.drain();
  }
}

/**
 * How long to wait before a nak'd message comes back.
 *
 * Doubling from one second, capped at eight, so a default budget of five
 * attempts spans roughly half a minute instead of a few milliseconds. The cap
 * matters as much as the growth: a message must still reach `max_deliver` and
 * park while an operator is awake to see it, rather than drifting into a
 * retry schedule nobody is watching.
 *
 * `redeliveryCount` is 1 on the first delivery, so the first retry waits 1s.
 */
export function nakBackoffMs(redeliveryCount: number): number {
  const attempt = Number.isFinite(redeliveryCount) && redeliveryCount > 0 ? Math.floor(redeliveryCount) : 1;
  return Math.min(1_000 * 2 ** (attempt - 1), 8_000);
}

/** Idempotent stream creation — safe to call on every boot. */
export async function ensureStream(jsm: JetStreamManager, service: ModuleId, prefix = 'INTAFACED'): Promise<void> {
  const name = streamName(service, prefix);
  const config = {
    name,
    subjects: [wildcard(service)],
    retention: RetentionPolicy.Limits,
    max_age: 90 * 24 * 60 * 60 * 1_000_000_000, // 90d in ns
    duplicate_window: 2 * 60 * 1_000_000_000, // 2m dedupe window
  };

  try {
    await jsm.streams.add(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Already exists — reconcile subjects in case the registry grew.
    if (/already in use|stream name already/i.test(message)) {
      await jsm.streams.update(name, config);
      return;
    }
    throw err;
  }
}
