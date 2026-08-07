import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError, type OrderSide } from '../spot/types.js';
import { acceptableForAlgo, algoMarkMissing, withinPriceBand, type AlgoMarkPolicy, DEFAULT_ALGO_MARK_POLICY } from './mark-gate.js';
import { planTwapSlices } from './schedule.js';
import type { AlgoChildRef, AlgoMiss, AlgoMissCode, AlgoQuotedMark, CreateTwapInput, TwapParent } from './types.js';

/**
 * TWAP engine (D-S-04 v1) — schedule that emits child orders.
 *
 * No ledger posts. No parent holds. Children are placed only through the
 * injected `placeChild` port (TradeService.placeOrder in production).
 *
 * Cancel disposition (pinned): cancel in-flight children via `cancelChild`.
 * Pause disposition (pinned): emit no further children; resume does not
 * re-run elapsed slices.
 */

export interface PlaceChildRequest {
  readonly parentId: string;
  readonly sliceIndex: number;
  readonly clientOrderId: string;
  readonly marketId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly qty: Amount;
  readonly limitPrice: Amount | null;
  readonly subAccountId: string | null;
}

export interface PlaceChildResult {
  readonly orderId: string;
}

export interface TwapEnginePorts {
  placeChild(req: PlaceChildRequest): Promise<PlaceChildResult>;
  /** Cancel disposition for in-flight children on parent cancel. */
  cancelChild(orderId: string): Promise<void>;
  /**
   * Best opposing price for band check + liquidity probe.
   * Null / empty = no liquidity (record miss, do not invent fill).
   */
  bestOpposingPrice(marketId: string, side: OrderSide): Promise<Amount | null>;
  /** Mark feed. Null = halt (refuse invent). */
  markFor(marketId: string): Promise<AlgoQuotedMark | null>;
  now(): Date;
  randomId(): string;
}

export interface TwapEngineOptions {
  markPolicy?: AlgoMarkPolicy;
  /** Max duration (default 24h). */
  maxDurationMs?: number;
  /** Min slice interval (default 1s). */
  minSliceIntervalMs?: number;
}

export type SliceTickResult =
  | { readonly kind: 'placed'; readonly child: AlgoChildRef }
  | { readonly kind: 'miss'; readonly miss: AlgoMiss }
  | { readonly kind: 'halted'; readonly reason: string; readonly code: AlgoMissCode }
  | { readonly kind: 'idle'; readonly reason: 'paused' | 'cancelled' | 'completed' | 'halted' | 'ahead_of_schedule' }
  | { readonly kind: 'completed' };

export class TwapEngine {
  private readonly parents = new Map<string, TwapParent>();
  /** Slice qty plans keyed by parent id. */
  private readonly plans = new Map<string, readonly Amount[]>();
  private readonly markPolicy: AlgoMarkPolicy;
  private readonly maxDurationMs: number;
  private readonly minSliceIntervalMs: number;

  constructor(
    private readonly ports: TwapEnginePorts,
    options: TwapEngineOptions = {},
  ) {
    this.markPolicy = options.markPolicy ?? DEFAULT_ALGO_MARK_POLICY;
    this.maxDurationMs = options.maxDurationMs ?? 86_400_000;
    this.minSliceIntervalMs = options.minSliceIntervalMs ?? 1_000;
  }

  get(parentId: string): TwapParent | undefined {
    return this.parents.get(parentId);
  }

  listForUser(userId: string): TwapParent[] {
    return [...this.parents.values()].filter((p) => p.userId === userId);
  }

  create(userId: string, input: CreateTwapInput, lotSize: Amount): TwapParent {
    if (input.durationMs > this.maxDurationMs) {
      throw new TradeError(`TWAP duration exceeds max ${this.maxDurationMs}ms`, 'trade.algo_invalid_schedule');
    }
    if (input.sliceIntervalMs < this.minSliceIntervalMs) {
      throw new TradeError(`TWAP sliceIntervalMs below min ${this.minSliceIntervalMs}ms`, 'trade.algo_invalid_schedule');
    }

    const plan = planTwapSlices({
      totalQty: input.totalQty,
      durationMs: input.durationMs,
      sliceIntervalMs: input.sliceIntervalMs,
      lotSize,
    });

    const now = this.ports.now();
    const id = input.clientAlgoId?.trim() ? `algo-${userId.slice(0, 8)}-${input.clientAlgoId.trim()}` : this.ports.randomId();

    if (this.parents.has(id)) {
      throw new TradeError(`algo id ${id} already exists`, 'trade.algo_duplicate_id');
    }

    const parent: TwapParent = {
      id,
      userId,
      subAccountId: input.subAccountId,
      marketId: input.marketId,
      symbol: input.symbol,
      side: input.side,
      kind: 'twap',
      totalQty: input.totalQty,
      durationMs: input.durationMs,
      sliceIntervalMs: input.sliceIntervalMs,
      limitPrice: input.limitPrice,
      status: 'active',
      createdAt: now,
      startedAt: now,
      pausedAt: null,
      haltReason: null,
      slicesPlanned: plan.slices.length,
      nextSliceIndex: 0,
      children: [],
      misses: [],
    };

    this.parents.set(id, parent);
    this.plans.set(id, plan.slices);
    return parent;
  }

  pause(userId: string, parentId: string): TwapParent {
    const parent = this.requireOwner(userId, parentId);
    if (parent.status !== 'active') {
      throw new TradeError(`cannot pause algo in status ${parent.status}`, 'trade.algo_bad_state');
    }
    return this.replace(parentId, {
      ...parent,
      status: 'paused',
      pausedAt: this.ports.now(),
    });
  }

  resume(userId: string, parentId: string): TwapParent {
    const parent = this.requireOwner(userId, parentId);
    if (parent.status !== 'paused') {
      throw new TradeError(`cannot resume algo in status ${parent.status}`, 'trade.algo_bad_state');
    }
    // Resume does NOT rewind nextSliceIndex — elapsed slices stay elapsed.
    return this.replace(parentId, {
      ...parent,
      status: 'active',
      pausedAt: null,
    });
  }

  /**
   * Cancel: no further children. In-flight children are cancelled (one
   * disposition, every time).
   */
  async cancel(userId: string, parentId: string): Promise<TwapParent> {
    const parent = this.requireOwner(userId, parentId);
    if (parent.status === 'cancelled') return parent;
    if (parent.status === 'completed') {
      throw new TradeError('cannot cancel a completed algo', 'trade.algo_bad_state');
    }

    for (const child of parent.children) {
      await this.ports.cancelChild(child.orderId);
    }

    return this.replace(parentId, {
      ...parent,
      status: 'cancelled',
      haltReason: null,
    });
  }

  /**
   * Emit the next due slice, or record a miss / halt.
   * Call on interval; skips when ahead of schedule or not active.
   */
  async tick(parentId: string): Promise<SliceTickResult> {
    const parent = this.parents.get(parentId);
    if (!parent) throw new TradeError(`algo ${parentId} not found`, 'trade.algo_not_found');

    if (parent.status === 'paused') return { kind: 'idle', reason: 'paused' };
    if (parent.status === 'cancelled') return { kind: 'idle', reason: 'cancelled' };
    if (parent.status === 'halted') return { kind: 'idle', reason: 'halted' };
    if (parent.status === 'completed') return { kind: 'idle', reason: 'completed' };

    const plan = this.plans.get(parentId);
    if (!plan) throw new TradeError(`algo plan missing for ${parentId}`, 'trade.algo_not_found');

    if (parent.nextSliceIndex >= plan.length) {
      this.replace(parentId, { ...parent, status: 'completed' });
      return { kind: 'completed' };
    }

    const now = this.ports.now();
    const dueAt = parent.startedAt.getTime() + parent.nextSliceIndex * parent.sliceIntervalMs;
    if (now.getTime() < dueAt) {
      return { kind: 'idle', reason: 'ahead_of_schedule' };
    }

    // Mark gate — blank/stale/invalid HALTS (D-S-04 refuse table).
    const mark = await this.ports.markFor(parent.marketId);
    if (!mark) {
      const check = algoMarkMissing(parent.marketId);
      return this.halt(parent, check.reason!, 'trade.algo_mark_missing');
    }
    const markOk = acceptableForAlgo(mark, now, this.markPolicy);
    if (!markOk.ok) {
      const code: AlgoMissCode = markOk.code === 'trade.algo_mark_missing' ? 'trade.algo_mark_missing' : 'trade.algo_mark_unusable';
      return this.halt(parent, markOk.reason!, code);
    }

    // Liquidity probe — empty book = miss, not invent fill.
    const opposing = await this.ports.bestOpposingPrice(parent.marketId, parent.side);
    if (opposing === null) {
      return this.recordMiss(parent, {
        sliceIndex: parent.nextSliceIndex,
        code: 'trade.algo_no_liquidity',
        reason: `${parent.symbol}: no opposing liquidity for slice ${parent.nextSliceIndex} — recorded miss, no fill invented`,
        at: now,
      });
    }

    if (!withinPriceBand(parent.side, opposing, parent.limitPrice)) {
      return this.recordMiss(parent, {
        sliceIndex: parent.nextSliceIndex,
        code: 'trade.algo_price_band',
        reason:
          `${parent.symbol}: opposing ${formatAmount(opposing)} outside limit band ` +
          `${parent.limitPrice === null ? 'none' : formatAmount(parent.limitPrice)} — slice skipped`,
        at: now,
      });
    }

    const qty = plan[parent.nextSliceIndex]!;
    const clientOrderId = `algo:${parent.id}:${parent.nextSliceIndex}`;

    try {
      const placed = await this.ports.placeChild({
        parentId: parent.id,
        sliceIndex: parent.nextSliceIndex,
        clientOrderId,
        marketId: parent.marketId,
        symbol: parent.symbol,
        side: parent.side,
        qty,
        limitPrice: parent.limitPrice,
        subAccountId: parent.subAccountId,
      });

      const child: AlgoChildRef = {
        sliceIndex: parent.nextSliceIndex,
        orderId: placed.orderId,
        clientOrderId,
        qty,
        placedAt: now,
      };

      const next = parent.nextSliceIndex + 1;
      const updated: TwapParent = {
        ...parent,
        nextSliceIndex: next,
        children: [...parent.children, child],
        status: next >= plan.length ? 'completed' : parent.status,
      };
      this.parents.set(parent.id, updated);
      return { kind: 'placed', child };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err instanceof TradeError && err.code === 'trade.algo_insufficient_balance'
          ? 'trade.algo_insufficient_balance'
          : err instanceof TradeError && err.code.startsWith('ledger')
            ? 'trade.algo_insufficient_balance'
            : 'trade.algo_child_refused';

      // Insufficient balance mid-schedule → HALT (refuse table).
      if (code === 'trade.algo_insufficient_balance' || message.toLowerCase().includes('insufficient')) {
        return this.halt(parent, `insufficient balance mid-schedule: ${message}`, 'trade.algo_insufficient_balance');
      }

      return this.recordMiss(parent, {
        sliceIndex: parent.nextSliceIndex,
        code: 'trade.algo_child_refused',
        reason: `child place refused: ${message}`,
        at: now,
      });
    }
  }

  /** Drive all active parents once (job host). */
  async tickAll(): Promise<void> {
    for (const [id, parent] of this.parents) {
      if (parent.status === 'active') {
        await this.tick(id);
      }
    }
  }

  private halt(parent: TwapParent, reason: string, code: AlgoMissCode): SliceTickResult {
    const now = this.ports.now();
    const miss: AlgoMiss = {
      sliceIndex: parent.nextSliceIndex,
      code,
      reason,
      at: now,
    };
    this.replace(parent.id, {
      ...parent,
      status: 'halted',
      haltReason: reason,
      misses: [...parent.misses, miss],
      // Do not advance nextSliceIndex on halt — slice was not completed.
    });
    return { kind: 'halted', reason, code };
  }

  private recordMiss(parent: TwapParent, miss: AlgoMiss): SliceTickResult {
    const plan = this.plans.get(parent.id)!;
    const next = parent.nextSliceIndex + 1;
    const updated: TwapParent = {
      ...parent,
      nextSliceIndex: next,
      misses: [...parent.misses, miss],
      status: next >= plan.length ? 'completed' : parent.status,
    };
    this.parents.set(parent.id, updated);
    return { kind: 'miss', miss };
  }

  private requireOwner(userId: string, parentId: string): TwapParent {
    const parent = this.parents.get(parentId);
    if (!parent) throw new TradeError(`algo ${parentId} not found`, 'trade.algo_not_found');
    if (parent.userId !== userId) throw new TradeError('not the algo owner', 'trade.not_owner');
    return parent;
  }

  private replace(id: string, parent: TwapParent): TwapParent {
    this.parents.set(id, parent);
    return parent;
  }
}
