import { z } from 'zod';
import { loadEnv, serviceEnvSchema } from '@intafaced/config';

/**
 * svc-agents environment.
 *
 * ── Why the upstream is described here and named nowhere ────────────────────
 *
 * §1 puts a specific vendor first and Doctrine §0.5 makes providers swappable;
 * Doctrine §0.7 forbids third-party system names in anything shipped. All three
 * hold if the provider's identity lives in deployment configuration rather than
 * in source — so the variables below describe an upstream's *shape* (where it
 * is, how it authenticates, which aliases map to which of its model ids) and
 * the deployment supplies the values.
 *
 * The practical test of whether that is real: swapping providers is editing
 * `AGENTS_UPSTREAM_*` and restarting. No code changes, no redeploy of a
 * different build, nothing to review. That is what §8.2 means by
 * "provider-agnostic".
 *
 * `AGENTS_UPSTREAM_API_KEY` matches `packages/config`'s secret pattern
 * (`_KEY`), so `redactEnv` masks it anywhere env is logged. It is read once, in
 * `index.ts`, handed to the adapter, and never placed on a span or in an error.
 */

const jsonRecord = (label: string) =>
  z
    .string()
    .default('{}')
    .transform((raw, ctx) => {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v !== 'string') throw new Error(`value for "${k}" is not a string`);
          out[k] = v;
        }
        return out;
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a JSON object of string values: ${(err as Error).message}`,
        });
        return z.NEVER;
      }
    });

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !['0', 'false', 'off', 'no'].includes(v.toLowerCase())));

const schema = serviceEnvSchema.merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-agents'),
    HTTP_PORT: z.coerce.number().int().default(4008),

    /** svc-ledger's internal address. Metered usage is billed through it. */
    LEDGER_URL: z.string().url().default('http://localhost:4001'),

    /** Asset premium agent tiers are billed in (§8.2). */
    AGENTS_FEE_ASSET_ID: z.string().default('IFC'),

    /**
     * Billing window length. Must divide 1440 so a window never straddles
     * midnight — a window that spans two days has an ambiguous id, and the id
     * is half of the ledger idempotency key.
     */
    AGENTS_USAGE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),

    /**
     * Kill-switch for billing (§14 admin controls). Usage is still RECORDED
     * when this is off: turning metering off must not also destroy the ability
     * to find out what the fleet cost while it was off.
     */
    AGENTS_METERING_ENABLED: bool.default(true),

    /**
     * Which registered provider serves the logical id `primary` in the routing
     * table. `mock` is the default so a developer can run the fleet with no
     * upstream credential — and, more usefully, so starting this service by
     * accident cannot spend money.
     */
    AGENTS_PROVIDER: z.enum(['mock', 'upstream']).default('mock'),

    // ── Upstream shape ───────────────────────────────────────────────────────
    AGENTS_UPSTREAM_BASE_URL: z.string().url().optional(),
    AGENTS_UPSTREAM_API_KEY: z.string().min(1).optional(),
    AGENTS_UPSTREAM_AUTH_HEADER: z.string().default('x-api-key'),
    AGENTS_UPSTREAM_AUTH_PREFIX: z.string().default(''),
    /** Static headers — protocol version pins, tenant ids. JSON object. */
    AGENTS_UPSTREAM_HEADERS: jsonRecord('AGENTS_UPSTREAM_HEADERS'),
    AGENTS_UPSTREAM_COMPLETIONS_PATH: z.string().default('/v1/messages'),
    /** Set only when the upstream serves embeddings; gates the capability. */
    AGENTS_UPSTREAM_EMBEDDINGS_PATH: z.string().optional(),
    /** Routing alias → concrete upstream model id. JSON object. */
    AGENTS_UPSTREAM_MODELS: jsonRecord('AGENTS_UPSTREAM_MODELS'),
    AGENTS_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(600_000).default(60_000),

    /**
     * Full routing table as JSON, overriding the built-in default (§8.2
     * "per-task model routing table"). Absent = the default table in
     * `gateway/routing.ts`, which is priced for development, not production.
     */
    AGENTS_ROUTING_TABLE: z.string().optional(),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
