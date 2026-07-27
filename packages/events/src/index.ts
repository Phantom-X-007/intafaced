/**
 * @intafaced/events — the NATS subject law, the event catalog, and the bus.
 *
 * §2: cross-service calls go through packages/contracts (tRPC) or
 *     packages/events (NATS). Nothing else.
 */
export * from './subject.js';
export * from './envelope.js';
export * from './catalog.js';
export * from './bus.js';
export * from './memory-bus.js';
export { JetStreamEventBus, ensureStream, type JetStreamBusOptions } from './jetstream-bus.js';
