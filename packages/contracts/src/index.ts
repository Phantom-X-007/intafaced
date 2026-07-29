/**
 * @intafaced/contracts — shared zod schemas and tRPC routers.
 *
 * §15.2: "One service per task; cross-service needs = contracts/events PR first."
 * A change here is reviewed on its own, before either side implements it.
 */
export * from './trpc.js';
export * from './edge.js';
export * from './service-auth.js';
export * from './identity.js';
export * from './instruments.js';
export * from './blueprint.js';
export * from './example-router.js';
