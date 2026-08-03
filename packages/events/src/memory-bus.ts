import type { EventBus, Handler, PublishOptions, SubscribeOptions, Subscription, Payload } from './bus.js';
import { acceptEnvelope, buildEnvelope } from './bus.js';
import { EVENT_CATALOG, type EventName, type EventDef } from './catalog.js';
import type { Envelope } from './envelope.js';

/**
 * In-memory bus for unit tests and single-process dev.
 *
 * Behaves like JetStream where it matters: envelopes are validated on publish
 * AND on delivery, handlers run sequentially per subject, and every published
 * envelope is retained so a test can assert on the emitted stream.
 */
export class MemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Array<{ durable: string; fn: Handler<never> }>>();
  readonly published: Envelope[] = [];

  constructor(private readonly producer = 'test') {}

  async publish<K extends EventName>(name: K, payload: Payload<K>, opts: PublishOptions = {}): Promise<Envelope<Payload<K>>> {
    const env = buildEnvelope(name, payload, this.producer, opts);
    this.published.push(env as Envelope);

    const def = EVENT_CATALOG[name] as EventDef;
    for (const { fn } of this.handlers.get(def.subject) ?? []) {
      // Re-validate on delivery, exactly as the JetStream consumer does —
      // version, schema and drift, through the same `acceptEnvelope`. A test bus
      // that skipped a check the real one performs would certify the wrong thing.
      const validated = acceptEnvelope(name, env as Envelope);
      await (fn as unknown as Handler<K>)(validated, env);
    }
    return env;
  }

  async subscribe<K extends EventName>(name: K, handler: Handler<K>, opts: SubscribeOptions): Promise<Subscription> {
    const def = EVENT_CATALOG[name] as EventDef;
    const list = this.handlers.get(def.subject) ?? [];
    const entry = { durable: opts.durable, fn: handler as unknown as Handler<never> };
    list.push(entry);
    this.handlers.set(def.subject, list);

    return {
      unsubscribe: async () => {
        const current = this.handlers.get(def.subject) ?? [];
        this.handlers.set(
          def.subject,
          current.filter((e) => e !== entry),
        );
      },
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }

  /** Test helper: every envelope published for a given event. */
  emitted<K extends EventName>(name: K): Array<Envelope<Payload<K>>> {
    const def = EVENT_CATALOG[name] as EventDef;
    return this.published.filter((e) => e.subject === def.subject) as Array<Envelope<Payload<K>>>;
  }

  reset(): void {
    this.published.length = 0;
  }
}
