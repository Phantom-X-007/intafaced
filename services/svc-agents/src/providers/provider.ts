/**
 * ModelProvider — the §8.2 gateway adapter interface.
 *
 * Doctrine §0.4: "Adapters, not integrations. All external rails sit behind
 * internal interfaces… the platform never depends on them to function."
 * Doctrine §0.5: "Performance-critical services are isolated behind interfaces
 * so they can be ported without touching callers."
 *
 * This is deliberately the same shape as `LiquiditySource` in
 * `packages/venue-adapter/src/source.ts`, for the same reason: the runtime has
 * no notion of which provider is "ours" or "primary". It asks the routing table
 * which provider serves a task, checks the provider declares the capability,
 * and calls it. A provider is a row of configuration, not a branch in code —
 * which is what §1 means by "providers swappable per Doctrine 5".
 *
 * Two consequences worth stating, because they are load-bearing:
 *
 *  1. **No provider name appears above this interface.** The runtime, the
 *     metering, the audit log and every API response talk about a `providerId`
 *     that came from configuration. Doctrine §0.7 then holds by construction
 *     rather than by everyone remembering it.
 *
 *  2. **Usage is reported by the provider, not estimated by us.** `TokenUsage`
 *     comes back from the adapter with the exact counts the upstream charged
 *     for. Metering that estimated its own token counts would drift from what
 *     the platform actually pays, and the direction of that drift would be
 *     invisible.
 */

export type ProviderCapability = 'complete' | 'stream' | 'embed';

export interface ProviderHealth {
  readonly healthy: boolean;
  /** Round-trip latency in ms of the last call; used to detect degradation. */
  readonly latencyMs: number;
  /** When this provider last answered. */
  readonly lastUpdate: Date;
  /** Operator-facing only. Never rendered to a user (Doctrine §0.7). */
  readonly reason?: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  readonly role: MessageRole;
  readonly content: string;
}

export interface CompletionRequest {
  /** The model identifier as THIS provider understands it. Comes from the routing table. */
  readonly model: string;
  /** Standing instructions. Separate from `messages` so it can be cached upstream. */
  readonly system?: string;
  readonly messages: readonly ChatMessage[];
  /**
   * Hard ceiling on generated tokens. Required, not optional: an unbounded
   * generation is an unbounded bill, and §8.2 meters cost per user.
   */
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly stopSequences?: readonly string[];
  /** Abort signal so a timeout cancels the upstream call rather than orphaning it. */
  readonly signal?: AbortSignal;
}

/**
 * Exact token counts as reported by the provider.
 *
 * Integers, always. These are counts, not money — the conversion to an `Amount`
 * happens once, at settlement, in `metering/pricing.ts`.
 */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type StopReason = 'end' | 'max_tokens' | 'stop_sequence' | 'refusal';

export interface CompletionResult {
  readonly providerId: string;
  readonly model: string;
  readonly text: string;
  readonly usage: TokenUsage;
  readonly stopReason: StopReason;
}

export interface StreamChunk {
  /** Incremental text. Empty on the final chunk, which carries `usage`. */
  readonly delta: string;
  readonly done: boolean;
  /** Present only on the final chunk. */
  readonly usage?: TokenUsage;
  readonly stopReason?: StopReason;
}

export interface EmbedRequest {
  readonly model: string;
  readonly inputs: readonly string[];
  readonly signal?: AbortSignal;
}

export interface EmbedResult {
  readonly providerId: string;
  readonly model: string;
  readonly vectors: ReadonlyArray<readonly number[]>;
  readonly usage: TokenUsage;
}

export interface ModelProvider {
  /** Stable configuration id, e.g. 'mock' or 'primary'. Never a vendor name in copy. */
  readonly id: string;
  readonly capabilities: readonly ProviderCapability[];

  health(): ProviderHealth;

  /** The one required capability — a provider that cannot complete is not a provider. */
  complete(request: CompletionRequest): Promise<CompletionResult>;

  /** Declared via `capabilities`, so the gateway checks before it calls. */
  stream?(request: CompletionRequest): AsyncIterable<StreamChunk>;
  embed?(request: EmbedRequest): Promise<EmbedResult>;
}

export function supports(provider: ModelProvider, capability: ProviderCapability): boolean {
  return provider.capabilities.includes(capability);
}

/**
 * A provider is usable only when it is healthy AND recently so.
 *
 * Same failure mode as a stale venue quote: a provider that has stopped
 * answering still reports whatever `health()` last recorded, and it looks fine
 * right up until every request in the queue times out against it. Freshness is
 * part of health, not a separate concern.
 */
export function isUsable(provider: ModelProvider, now: Date = new Date(), maxStalenessMs = 60_000): boolean {
  const health = provider.health();
  if (!health.healthy) return false;
  return now.getTime() - health.lastUpdate.getTime() <= maxStalenessMs;
}

/** Total tokens, for span attributes and rate accounting. */
export function totalTokens(usage: TokenUsage): number {
  return usage.inputTokens + usage.outputTokens;
}
