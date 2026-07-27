import type { Config } from 'drizzle-kit';

/**
 * Migration tooling.
 *
 * §14 DoD: "All schema migrations reversible and applied in CI."
 *
 * Each service owns `drizzle.config.ts` at its root, built from this factory,
 * so migration output paths and schema isolation are identical everywhere and
 * a service physically cannot generate migrations into another's schema.
 */
export function drizzleConfig(options: {
  /** Postgres schema this service owns, e.g. 'ledger'. */
  schema: string;
  /** Path to the drizzle table definitions, relative to the service root. */
  schemaPath?: string;
  out?: string;
  url?: string;
}): Config {
  const url = options.url ?? process.env.DATABASE_URL ?? `postgres://svc_${options.schema}:svc_${options.schema}@localhost:5432/intafaced`;

  return {
    dialect: 'postgresql',
    schema: options.schemaPath ?? './src/db/schema.ts',
    out: options.out ?? './drizzle',
    schemaFilter: [options.schema],
    dbCredentials: { url },
    strict: true,
    verbose: true,
  };
}

/**
 * Every migration ships with its down. drizzle-kit only generates `up` SQL, so
 * the reversal lives beside it as `<name>.down.sql` and CI asserts the pair
 * exists — see tooling/ci/migration-check.mjs.
 */
export const MIGRATION_CONVENTION = {
  upSuffix: '.sql',
  downSuffix: '.down.sql',
  journal: 'meta/_journal.json',
} as const;
