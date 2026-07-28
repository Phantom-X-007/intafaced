import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';

// This service self-mounts /trpc, so it must be able to authenticate the edge.
// `export` and `erase` act on `ctx.principal.userId` and nothing else, which is
// only a privacy guarantee if that userId cannot be asserted by the caller
// (docs/decisions/mount-boundary.md).
const schema = serviceEnvSchema.merge(edgeEnvSchema).merge(
  z.object({
    SERVICE_NAME: z.string().default('svc-blueprint'),
    HTTP_PORT: z.coerce.number().int().default(4008),

    /**
     * The Neural Engine's HTTP contract (§7.1). The engine is an external
     * deployment; this service owns the `NeuralEngineClient` interface in front
     * of it and nothing behind it.
     */
    BLUEPRINT_ENGINE_URL: z.string().url().default('http://localhost:4108'),

    /**
     * Hard ceiling on one engine call.
     *
     * §7.2 budgets the whole flow at under three minutes, and the engine call
     * is the only unbounded step in it. 20s leaves room for a retry the user
     * can sit through; anything longer and the page has already lost them.
     */
    BLUEPRINT_ENGINE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),

    /** Never logged. */
    BLUEPRINT_ENGINE_API_KEY: z.string().optional(),

    /**
     * `mock` runs the deterministic in-process engine — for local development
     * and for environments where the external deployment is not reachable. It
     * is not a fallback: the mode is chosen explicitly, so a misconfigured
     * production URL fails loudly instead of quietly serving stub profiles to
     * real people.
     */
    BLUEPRINT_ENGINE_MODE: z.enum(['http', 'mock']).default('http'),

    /** Default crew size. Stored per crew, so changing this affects new crews only. */
    BLUEPRINT_CREW_CAPACITY: z.coerce.number().int().min(2).max(24).default(6),

    /** How many mentors a shortlist holds (§7.1). */
    BLUEPRINT_MENTOR_SHORTLIST_SIZE: z.coerce.number().int().min(1).max(10).default(3),

    /** Current crew season. Crews are formed and named within a season. */
    BLUEPRINT_SEASON: z.coerce.number().int().min(1).default(1),
  }),
);

export const env = loadEnv(schema);
export type Env = typeof env;
