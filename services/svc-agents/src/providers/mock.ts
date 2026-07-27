import { createHash } from 'node:crypto';
import { ProviderError } from '../errors.js';
import type {
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  EmbedRequest,
  EmbedResult,
  ModelProvider,
  ProviderCapability,
  ProviderHealth,
  StreamChunk,
  TokenUsage,
} from './provider.js';

/**
 * Deterministic in-process provider.
 *
 * This is not a stub that returns "ok". It is the executable specification of
 * what the gateway is allowed to assume about a provider, and the tests for
 * routing, metering and guardrails all run against it:
 *
 *   · Same request in → byte-identical text and token counts out. A metering
 *     test asserting an exact `Amount` is only meaningful if the token counts
 *     it prices are reproducible.
 *   · Token counts are a pure function of the request, so a test can compute
 *     the expected bill independently of the code under test rather than
 *     asserting against whatever the implementation happened to produce.
 *   · Failures are injectable and typed, so "the engine went down mid-session"
 *     is a test case rather than a thought experiment.
 *
 * It ships in `src`, not in a test folder, because `AGENTS_PROVIDER_ID=mock` is
 * the correct default for local development: a developer running the fleet
 * should not need an upstream credential, and should not be able to spend real
 * money by starting the service.
 */

export interface MockProviderOptions {
  readonly id?: string;
  /** Fail every call with this error until cleared. Simulates an outage. */
  readonly failWith?: ProviderError;
  /** Fail only the first N calls, then recover. Simulates a transient blip. */
  readonly failFirst?: number;
  readonly capabilities?: readonly ProviderCapability[];
  readonly latencyMs?: number;
}

/**
 * Token accounting for the mock.
 *
 * Four characters per token is the conventional rough ratio and it does not
 * matter that it is rough — what matters is that it is FIXED, so a test can
 * predict the count. Every real adapter reports the upstream's own counts.
 */
const CHARS_PER_TOKEN = 4;

export function mockInputTokens(request: CompletionRequest): number {
  const system = request.system ?? '';
  const body = request.messages.map((m: ChatMessage) => `${m.role}:${m.content}`).join('\n');
  return Math.ceil((system.length + body.length) / CHARS_PER_TOKEN);
}

export function mockOutputTokens(request: CompletionRequest): number {
  // Deterministic pseudo-length in [1, maxOutputTokens], derived from the
  // request digest so it varies across requests but never across runs.
  const digest = requestDigest(request);
  const nibble = parseInt(digest.slice(0, 4), 16);
  return 1 + (nibble % Math.max(1, request.maxOutputTokens));
}

export function mockUsage(request: CompletionRequest): TokenUsage {
  return { inputTokens: mockInputTokens(request), outputTokens: mockOutputTokens(request) };
}

function requestDigest(request: CompletionRequest): string {
  const canonical = JSON.stringify({
    model: request.model,
    system: request.system ?? null,
    messages: request.messages.map((m) => [m.role, m.content]),
    maxOutputTokens: request.maxOutputTokens,
    temperature: request.temperature ?? null,
    stopSequences: request.stopSequences ?? [],
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export class MockModelProvider implements ModelProvider {
  readonly id: string;
  readonly capabilities: readonly ProviderCapability[];

  private calls = 0;
  private failures = 0;
  private lastUpdate = new Date(0);
  private lastLatencyMs: number;
  private failWith: ProviderError | undefined;
  private failFirst: number;

  constructor(options: MockProviderOptions = {}) {
    this.id = options.id ?? 'mock';
    this.capabilities = options.capabilities ?? ['complete', 'stream', 'embed'];
    this.lastLatencyMs = options.latencyMs ?? 1;
    this.failWith = options.failWith;
    this.failFirst = options.failFirst ?? 0;
  }

  /** Test control: start failing. */
  breakWith(error: ProviderError): void {
    this.failWith = error;
  }

  /** Test control: stop failing. */
  repair(): void {
    this.failWith = undefined;
    this.failFirst = 0;
  }

  /** How many times the gateway actually reached the provider. */
  get callCount(): number {
    return this.calls;
  }

  get failureCount(): number {
    return this.failures;
  }

  health(): ProviderHealth {
    // A provider that has never been called is healthy but stale, exactly like
    // a venue with no ticks yet — `isUsable` treats those the same way.
    if (this.failWith) {
      return { healthy: false, latencyMs: this.lastLatencyMs, lastUpdate: this.lastUpdate, reason: this.failWith.message };
    }
    return { healthy: true, latencyMs: this.lastLatencyMs, lastUpdate: this.calls === 0 ? new Date() : this.lastUpdate };
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    this.calls++;
    // Freshness is recorded before the failure branch: a provider that answered
    // with an error still answered. That is what separates a transient blip
    // (`failFirst` — the next call is routed normally) from an outage
    // (`failWith` — `health()` reports unhealthy and the gateway stops routing).
    this.lastUpdate = new Date();
    this.throwIfBroken();

    const usage = mockUsage(request);
    const digest = requestDigest(request);

    return {
      providerId: this.id,
      model: request.model,
      // Echoing the digest keeps the output deterministic and makes it obvious
      // in a log that this text came from the mock, not from an engine.
      text: `mock:${request.model}:${digest.slice(0, 16)}`,
      usage,
      stopReason: usage.outputTokens >= request.maxOutputTokens ? 'max_tokens' : 'end',
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const result = await this.complete(request);
    // Chunked at a fixed width so the sequence of deltas is reproducible too.
    for (let i = 0; i < result.text.length; i += 8) {
      yield { delta: result.text.slice(i, i + 8), done: false };
    }
    yield { delta: '', done: true, usage: result.usage, stopReason: result.stopReason };
  }

  async embed(request: EmbedRequest): Promise<EmbedResult> {
    this.calls++;
    this.lastUpdate = new Date();
    this.throwIfBroken();

    const vectors = request.inputs.map((input) => {
      const digest = createHash('sha256').update(`${request.model}:${input}`).digest();
      // 16 dimensions in [-1, 1). Small, deterministic, and enough to assert on.
      return Array.from({ length: 16 }, (_, i) => ((digest[i] ?? 0) - 128) / 128);
    });

    const inputTokens = request.inputs.reduce((acc, s) => acc + Math.ceil(s.length / CHARS_PER_TOKEN), 0);
    return { providerId: this.id, model: request.model, vectors, usage: { inputTokens, outputTokens: 0 } };
  }

  private throwIfBroken(): void {
    if (this.failWith) {
      this.failures++;
      throw this.failWith;
    }
    if (this.failFirst > 0) {
      this.failFirst--;
      this.failures++;
      throw new ProviderError('Injected transient failure', this.id, true, 503);
    }
  }
}
