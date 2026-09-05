import { z } from 'zod';
import { edgeEnvSchema, loadEnv, serviceEnvSchema } from '@intafaced/config';
import { assertProdEngine } from './prod-engine.js';

/**
 * An optional URL where the EMPTY STRING means "not set".
 *
 * `loadEnv` hands `process.env` to zod untouched, and compose's usual way of
 * declaring an optional knob — `FOO: ${FOO:-}` — sets the variable to `''`
 * rather than leaving it absent. Against a plain `z.string().url().optional()`
 * that is a validation failure, and because this schema is evaluated at import
 * time the symptom is the whole service refusing to boot over a rail it does
 * not even need.
 *
 * So `''` is normalised to `undefined` before validation. A non-empty value is
 * still required to be a real URL: a typo'd host must fail loudly at startup,
 * which is the case this must not swallow.
 */
export const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.string().url().optional());

/**
 * Owner-published integer. Compose `${VAR:-}` sets `''` rather than absent.
 * Blank / whitespace → unpublished (`undefined`). Never git-default a magnitude.
 */
function unpublishedInt(min: number, max?: number) {
  const num = max === undefined ? z.coerce.number().int().min(min) : z.coerce.number().int().min(min).max(max);
  return z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
  }, num.optional());
}

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
     *
     * The localhost default is for local/dev. `assertProdEngine` refuses it
     * (and an unset var, which lands on the same default) when APP_ENV=prod.
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

    /** Never logged. Empty string fails; unset omits. */
    BLUEPRINT_ENGINE_API_KEY: z.string().min(1).optional(),

    /**
     * `mock` runs the deterministic in-process engine — for local development
     * and for environments where the external deployment is not reachable. It
     * is not a fallback: the mode is chosen explicitly, so a misconfigured
     * production URL fails loudly instead of quietly serving stub profiles to
     * real people. `assertProdEngine` refuses `mock` when APP_ENV=prod.
     */
    BLUEPRINT_ENGINE_MODE: z.enum(['http', 'mock']).default('http'),

    /**
     * Owner-published default crew size. Stored per crew; changing this
     * affects new crews only. Blank / unset is unpublished — forming a crew
     * refuses `blueprint.crew_capacity_unset`. Never git-default 6.
     * Owner may set 6 explicitly.
     */
    BLUEPRINT_CREW_CAPACITY: unpublishedInt(2, 24),

    /**
     * Owner-published mentor shortlist length (§7.1). Blank / unset is
     * unpublished — shortlist write refuses `blueprint.mentor_shortlist_unset`.
     * Never git-default 3. Owner may set 3 explicitly.
     */
    BLUEPRINT_MENTOR_SHORTLIST_SIZE: unpublishedInt(1, 10),

    /**
     * Owner-published crew season. Crews are formed and named within a season.
     * Blank / unset is unpublished — placement refuses `blueprint.season_unset`.
     * Never git-default 1. Owner may set 1 explicitly.
     */
    BLUEPRINT_SEASON: unpublishedInt(1),

    /**
     * The card rasterizer (§7.1 "rendered server-side … → PNG").
     *
     * **Optional, and unset means unset.** There is deliberately no default URL:
     * one pointing at a host that does not exist would turn "this deployment has
     * no renderer" — a permanent, honest state a surface can render immediately
     * — into a timeout on every card request. When this is absent the service
     * boots `UnconfiguredCardRenderer`, the vector card still renders in full,
     * and the response carries a typed code saying why there is no PNG.
     */
    BLUEPRINT_CARD_RENDERER_URL: optionalUrl,

    /**
     * Shorter than the engine's 20s, on purpose. The engine call is the step a
     * user sits through during onboarding; the card is composed instantly and
     * only the hosted PNG is outstanding, so a slow renderer should give up
     * quickly and report `unavailable` rather than hold a share sheet open.
     */
    BLUEPRINT_CARD_RENDERER_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(10_000),

    /** Never logged. Empty string fails; unset omits. */
    BLUEPRINT_CARD_RENDERER_API_KEY: z.string().min(1).optional(),
  }),
);

export const env = loadEnv(schema);
assertProdEngine(env);
export type Env = typeof env;
