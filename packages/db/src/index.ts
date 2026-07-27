/**
 * @intafaced/db — Drizzle primitives, connections, migration tooling.
 *
 * This package holds NO table definitions. Every service defines its own
 * schema in its own `src/db/schema.ts`, under its own Postgres schema, behind
 * its own role. What lives here is only what must be identical everywhere:
 * column types, connection semantics, transaction isolation, and the test
 * harness.
 */
export * from './columns.js';
export * from './connection.js';
export * from './migrate.js';
export { createTestDb, postgresAvailable, type TestDb, type TestDbOptions } from './testing.js';
