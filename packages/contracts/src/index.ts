/**
 * @intafaced/contracts — shared zod schemas and tRPC routers.
 *
 * §15.2: "One service per task; cross-service needs = contracts/events PR first."
 * A change here is reviewed on its own, before either side implements it.
 */
export * from './trpc.js';
export * from './edge.js';
export * from './service-auth.js';
export * from './raw-body.js';
export * from './identity.js';
export * from './instruments.js';
export * from './blueprint.js';
export * from './example-router.js';
export * from './support.js';
export * from './ops-analytics.js';
export * from './ops-analytics-cube.js';
export * from './ops-analytics-consume.js';
export * from './ops-analytics-warehouse.js';
