import type { BlueprintProfile, BirthData } from '@intafaced/contracts';

/**
 * NeuralEngineClient — the §7.1 adapter interface.
 *
 * Doctrine §0.4: "Adapters, not integrations. All external rails sit behind
 * internal interfaces… the platform never depends on them to function."
 *
 * The onboarding intelligence is an external deployment reached over an HTTP
 * contract at `BLUEPRINT_ENGINE_URL`. Its internals are not in this repo and
 * are not ours. **This interface is the part we own**, and it is deliberately
 * the narrowest thing that can produce a Blueprint: give it a session, get back
 * a profile and the version that produced it. Nothing else about the engine is
 * visible to this service, which is what makes it swappable and what makes the
 * deterministic mock a legitimate stand-in for every test below the wire.
 *
 * Shape mirrors `LiquiditySource` in packages/venue-adapter (§5.2) on purpose:
 * an id, declared capabilities, a synchronous `health()` for routing decisions,
 * and async work. An engineer who has read one adapter has read both.
 *
 * ── Branding (Doctrine §0.7) ────────────────────────────────────────────────
 * User-facing copy — and, in this service, code, comments, tests and fixtures —
 * says only *Identity Blueprint*, *Sovereign Intelligence*, *Neural Engine*.
 * `tooling/ci/brand-scan.mjs` enforces it repo-wide and this package asserts it
 * on itself in `brand.test.ts` (§7.2's copy-scan, run from the inside).
 */

export type EngineCapability =
  /** Can derive a full profile from a session. The only capability we require. */
  | 'profile'
  /** Can re-derive an existing profile at a newer engine version. */
  | 'reprofile'
  /** Can stream partial results during a session. */
  | 'stream';

export interface EngineHealth {
  readonly healthy: boolean;
  /** Round-trip latency in ms. Feeds the <3-minute onboarding budget (§7.2). */
  readonly latencyMs: number;
  /** When this engine last answered. */
  readonly lastUpdate: Date;
  readonly reason?: string;
}

/**
 * One Blueprint session, reduced to what the engine needs.
 *
 * `birthData` is PII (§10). It crosses the wire to the engine and is then
 * dropped — there is no column for it, no log line that prints it, and no span
 * attribute that carries it. `responses` is the same: the guided sequence's
 * answers are input, never state.
 */
export interface BlueprintRequest {
  /**
   * Correlates the call with the session for tracing and engine-side retries.
   * Deliberately NOT part of what the profile is derived from — the same person
   * answering the same way must get the same profile on a second session.
   */
  readonly requestId: string;
  readonly locale: string;
  readonly responses: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly birthData?: BirthData;
}

export interface EngineProfileResult {
  /** Build identifier of the engine that produced this. */
  readonly engineVersion: string;
  readonly profile: BlueprintProfile;
  /** How long the engine took, for the onboarding budget. */
  readonly latencyMs: number;
}

export interface NeuralEngineClient {
  readonly id: string;
  readonly capabilities: readonly EngineCapability[];

  health(): EngineHealth;

  /**
   * Derive a profile. Throws `EngineUnavailableError` when it cannot — never
   * returns a partial or a default, because a made-up profile would be
   * indistinguishable downstream from a real one and would place someone in a
   * crew on the strength of a timeout.
   */
  profile(request: BlueprintRequest): Promise<EngineProfileResult>;
}

export function supports(engine: NeuralEngineClient, capability: EngineCapability): boolean {
  return engine.capabilities.includes(capability);
}

/**
 * An engine is usable only when it is healthy AND answered recently.
 *
 * Same failure mode as a stale venue quote (§5.2): an engine that has stopped
 * updating still answers, still looks fine, and returns a profile derived by a
 * build that was rolled back an hour ago.
 */
export function isUsable(engine: NeuralEngineClient, now: Date = new Date(), maxStalenessMs = 60_000): boolean {
  const health = engine.health();
  if (!health.healthy) return false;
  return now.getTime() - health.lastUpdate.getTime() <= maxStalenessMs;
}

/**
 * The engine could not answer. Onboarding aborts on this and writes nothing —
 * §7.2's "no half-written Blueprint" is enforced by throwing before the
 * transaction opens, not by cleaning up after it.
 */
export class EngineUnavailableError extends Error {
  readonly code = 'blueprint.engine_unavailable' as const;

  constructor(message: string, cause?: unknown) {
    // Native `Error.cause` rather than an own property: a hand-rolled `cause`
    // field shadows the standard one, and every logger and test runner that
    // knows how to unwrap an error chain reads the standard one.
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'EngineUnavailableError';
  }
}

/** The engine answered, but not with something we can store. */
export class EngineProtocolError extends Error {
  readonly code = 'blueprint.engine_protocol' as const;

  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'EngineProtocolError';
  }
}
