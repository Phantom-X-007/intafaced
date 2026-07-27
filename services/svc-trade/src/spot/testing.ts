import { BASE_PERKS, type RankPerks } from '@intafaced/contracts';
import type { Principal } from '@intafaced/auth';
import type {
  EngineCancelResult,
  EngineDepth,
  EngineFill,
  EngineSubmitRequest,
  EngineSubmitResult,
  MatchingClient,
} from './matching-client.js';
import type { RankPerksSource } from './rank-perks.js';

/**
 * TEST DOUBLES.
 *
 * Why these and not the real engine: §15.2 forbids one service importing
 * another's source, and svc-matching is a separate service with its own 76
 * tests covering the book itself. What is under test here is svc-trade's
 * ORDERING — hold before submit, fills before releases, one release per order —
 * and for that the engine needs to be scriptable, not realistic. A test that
 * had to construct a real book to produce a partial fill would be testing the
 * book.
 *
 * The shapes are svc-matching's published wire contract, decimal strings and
 * all, so a drift between the two would show up as a type error rather than as
 * a production surprise.
 *
 * The ledger, by contrast, is the REAL reference implementation
 * (`MemoryLedger`), which the conformance suite proves equivalent to
 * svc-ledger's Postgres engine. Nothing about money is faked.
 */

/** Builder: the order rests in full, nothing matched. */
export function restsInFull(request: EngineSubmitRequest, sequence: number): EngineSubmitResult {
  return {
    accepted: true,
    sequence,
    fills: [],
    resting: {
      kind: 'book',
      orderId: request.orderId,
      accountId: request.accountId,
      side: request.side,
      price: request.price ?? '0',
      remaining: request.qty,
      sequence,
    },
    rejected: null,
    cancellations: [],
    triggered: [],
  };
}

export interface ScriptedFill {
  makerOrderId: string;
  makerAccountId: string;
  price: string;
  qty: string;
}

export class StubMatching implements MatchingClient {
  readonly submitted: Array<{ marketId: string; request: EngineSubmitRequest }> = [];
  readonly cancelledOrders: string[] = [];

  /** Depth answered to `bestAsk`, used to price a market buy. */
  asks: Array<readonly [string, string]> = [];
  bids: Array<readonly [string, string]> = [];

  /** Called before each submit result is produced — lets a test observe ordering. */
  onSubmit: ((request: EngineSubmitRequest) => Promise<void> | void) | null = null;

  private sequence = 0;
  private readonly script: Array<(request: EngineSubmitRequest, next: () => number) => EngineSubmitResult> = [];
  private readonly cancelScript = new Map<string, EngineCancelResult>();

  /** Queue one submit outcome. Unscripted submissions rest in full. */
  script1(fn: (request: EngineSubmitRequest, next: () => number) => EngineSubmitResult): this {
    this.script.push(fn);
    return this;
  }

  /** Queue a submission that fills against an existing resting order. */
  scriptFills(fills: readonly ScriptedFill[], options: { restRemainder?: string; cancelRemainder?: string } = {}): this {
    return this.script1((request, next) => {
      const sequence = next();
      const engineFills: EngineFill[] = fills.map((f) => ({
        sequence: next(),
        makerOrderId: f.makerOrderId,
        makerAccountId: f.makerAccountId,
        takerOrderId: request.orderId,
        takerAccountId: request.accountId,
        takerSide: request.side,
        price: f.price,
        qty: f.qty,
      }));

      return {
        accepted: true,
        sequence,
        fills: engineFills,
        resting: options.restRemainder
          ? {
              kind: 'book',
              orderId: request.orderId,
              accountId: request.accountId,
              side: request.side,
              price: request.price ?? '0',
              remaining: options.restRemainder,
              sequence,
            }
          : null,
        rejected: null,
        cancellations: options.cancelRemainder
          ? [
              {
                orderId: request.orderId,
                accountId: request.accountId,
                remainingQty: options.cancelRemainder,
                sequence: next(),
                reason: 'ioc_remainder',
              },
            ]
          : [],
        triggered: [],
      };
    });
  }

  /** Queue a rejection — post-only would cross, FOK unfillable, and so on. */
  scriptRejection(code: string, message = code): this {
    return this.script1(() => ({
      accepted: false,
      sequence: null,
      fills: [],
      resting: null,
      rejected: { code, message },
      cancellations: [],
      triggered: [],
    }));
  }

  /** Queue a submission that pulls one of the submitter's own resting orders (§5.1 STP). */
  scriptSelfTradePrevention(pulledOrderId: string, accountId: string, remainingQty: string): this {
    return this.script1((request, next) => {
      const sequence = next();
      return {
        accepted: true,
        sequence,
        fills: [],
        resting: {
          kind: 'book',
          orderId: request.orderId,
          accountId: request.accountId,
          side: request.side,
          price: request.price ?? '0',
          remaining: request.qty,
          sequence,
        },
        rejected: null,
        cancellations: [{ orderId: pulledOrderId, accountId, remainingQty, sequence: next(), reason: 'self_trade_prevention' }],
        triggered: [],
      };
    });
  }

  /** The engine reports the order is not live — it already filled, or never arrived. */
  scriptCancelMiss(orderId: string): this {
    this.cancelScript.set(orderId, { cancelled: false, orderId, sequence: null, cancellation: null });
    return this;
  }

  async submit(marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push({ marketId, request });
    if (this.onSubmit) await this.onSubmit(request);
    const fn = this.script.shift();
    return fn ? fn(request, () => ++this.sequence) : restsInFull(request, ++this.sequence);
  }

  async cancel(_marketId: string, orderId: string): Promise<EngineCancelResult> {
    this.cancelledOrders.push(orderId);
    const scripted = this.cancelScript.get(orderId);
    if (scripted) return scripted;

    const sequence = ++this.sequence;
    return {
      cancelled: true,
      orderId,
      sequence,
      cancellation: { orderId, accountId: '', remainingQty: '0', sequence, reason: 'requested' },
    };
  }

  async depth(): Promise<EngineDepth> {
    return { bids: this.bids, asks: this.asks, sequence: this.sequence };
  }
}

/** An engine that cannot be reached. Used to test the indeterminate-submit branch. */
export class UnreachableMatching implements MatchingClient {
  readonly submitted: EngineSubmitRequest[] = [];

  async submit(_marketId: string, request: EngineSubmitRequest): Promise<EngineSubmitResult> {
    this.submitted.push(request);
    throw new Error('svc-matching is unreachable');
  }

  async cancel(_marketId: string, orderId: string): Promise<EngineCancelResult> {
    // A cancel for an order the engine never took.
    return { cancelled: false, orderId, sequence: null, cancellation: null };
  }

  async depth(): Promise<EngineDepth> {
    return { bids: [], asks: [], sequence: 0 };
  }
}

export class StubPerks implements RankPerksSource {
  readonly discounts = new Map<string, number>();
  /** Set to make the perk source fail, exercising the fail-closed branch. */
  unavailable = false;

  async perksOf(userId: string): Promise<RankPerks> {
    if (this.unavailable) throw new Error('svc-identity is unreachable');
    return { ...BASE_PERKS, feeDiscountBps: this.discounts.get(userId) ?? 0 };
  }
}

/** A verified session with the given scopes. */
export function principalFor(userId: string, scopes: readonly string[] = ['trade:write']): Principal {
  return {
    sub: userId,
    userId,
    scopes: [...scopes],
    tier: 'basic',
    mfa: false,
    sid: '99999999-9999-4999-8999-999999999999',
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}
