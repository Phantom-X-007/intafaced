/**
 * @intafaced/config — env, flags, jurisdiction, fiat registry.
 *
 * Doctrine reminder: this package holds configuration only. No I/O, no db, no
 * network. If something here needs a connection, it belongs in a service.
 */
export * from './modules.js';
export * from './env.js';
export * from './flags.js';
export * from './jurisdiction.js';
export * from './fiat.js';
