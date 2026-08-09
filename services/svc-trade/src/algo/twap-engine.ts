import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError, type OrderSide } from '../spot/types.js';
import { acceptableForAlgo, algoMarkMissing, withinPriceBand, type AlgoMarkPolicy, DEFAULT_ALGO_MARK_POLICY } from './mark-gate.js';
import { planTwapSlices } from './schedule.js';
import type {
  AlgoChildRef,
  AlgoMiss,
  AlgoMissCode,
  AlgoQuotedMark,
  AlgoScheduleStretchReason,
  CreateTwapInput,
  TwapParent,
} from './types.js';

/**
 * TWAP engine (D-S-04 v1) — schedule that emits child orders.
 *
 * No ledger posts. No parent holds. Children are placed only through the
 * injected `placeChild` port (TradeService.placeOrder in production).
 *
 * Cancel disposition (pinned): cancel in-flight children via `cancelChild`.
 * Status flips to cancelled only after every child cancel succeeds.
 *
 * Pause disposition (pinned): emit no further children; resume does not
 * re-run elapsed slices. Overdue slices re-space from the resume/outage
 * instant (ADR 2026-08-08): never more than one slice per sliceIntervalMs;
 * overdue work extends the schedule rather than bursting.
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
  /**
   * Durable schedule hook (SQL store in production). Called after every
   * parent/plan mutation so process restart can resume. Never invents fills.
   */
  onChange?: (parent: TwapParent, plan: readonly Amount[]) => void | Promise<void>;
}

export type SliceTickResult =
  | { readonly kind: 'placed'; readonly child: AlgoChildRef }
  | { readonly kind: 'miss'; readonly miss: AlgoMiss }
  | { readonly kind: 'halted'; readonly reason: string; readonly code: AlgoMissCode }
  | { readonly kind: 'idle'; readonly reason: 'paused' | 'cancelled' | 'completed' | 'halted' | 'ahead_of_schedule' }
  | { readonly kind: 'completed' };

/** Projected end from an event instant + remaining slice count (ADR formula). */
export function projectTwapEndsAt(fromMs: number, remainingSlices: number, sliceIntervalMs: number): Date {
  return new Date(fromMs + remainingSlices * sliceIntervalMs);
}

export class TwapEngine {
  private readonly parents = new Map<string, TwapParent>();
  /** Slice qty plans keyed by parent id. */
  private readonly plans = new Map<string, readonly Amount[]>();
  private readonly markPolicy: AlgoMarkPolicy;
  private readonly maxDurationMs: number;
  private readonly minSliceIntervalMs: number;
  private readonly onChange: ((parent: TwapParent, plan: readonly Amount[]) => void | Promise<void>) | null;

  constructor(
    private readonly ports: TwapEnginePorts,
    options: TwapEngineOptions = {},
  ) {
    this.markPolicy = options.markPolicy ?? DEFAULT_ALGO_MARK_POLICY;
    this.maxDurationMs = options.maxDurationMs ?? 86_400_000;
    this.minSliceIntervalMs = options.minSliceIntervalMs ?? 1_000;
    this.onChange = options.onChange ?? null;
  }

  get(parentId: string): TwapParent | undefined {
    return this.parents.get(parentId);
  }

  /** Restore a parent + plan after process restart (from durable store). */
  hydrate(parent: TwapParent, plan: readonly Amount[]): void {
    this.parents.set(parent.id, parent);
    this.plans.set(parent.id, plan);
  }

  planOf(parentId: string): readonly Amount[] | undefined {
    return this.plans.get(parentId);
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
      nextDueAt: now,
      projectedEndsAt: projectTwapEndsAt(now.getTime(), plan.slices.length, input.sliceIntervalMs),
      scheduleStretchReason: null,
      pausedAt: null,
      haltReason: null,
      slicesPlanned: plan.slices.length,
      nextSliceIndex: 0,
      children: [],
      misses: [],
    };

    this.parents.set(id, parent);
    this.plans.set(id, plan.slices);
    this.emitChange(parent);
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
    // Re-space from the resume instant (ADR 2026-08-08): overdue work extends
    // the schedule; never catch up as a burst against startedAt.
    const plan = this.plans.get(parentId);
    if (!plan) throw new TradeError(`algo plan missing for ${parentId}`, 'trade.algo_not_found');

    const now = this.ports.now();
    const remaining = plan.length - parent.nextSliceIndex;
    const projectedEndsAt = projectTwapEndsAt(now.getTime(), remaining, parent.sliceIntervalMs);
    const spanMs = projectedEndsAt.getTime() - parent.startedAt.getTime();
    if (spanMs > 2 * parent.durationMs) {
      throw new TradeError(
        `resume would more than double original duration (projected end ${projectedEndsAt.toISOString()}, started ${parent.startedAt.toISOString()}, durationMs ${parent.durationMs})`,
        'trade.algo_resume_extends_too_far',
      );
    }

    return this.replace(parentId, {
      ...parent,
      status: 'active',
      pausedAt: null,
      nextDueAt: now,
      projectedEndsAt,
      scheduleStretchReason: 'user_pause',
    });
  }

  /**
   * Cancel: no further children. In-flight children are cancelled (one
   * disposition, every time). Status → cancelled ONLY after every child
   * cancel succeeds; a throw leaves the parent non-cancelled.
   */
  async cancel(userId: string, parentId: string): Promise<TwapParent> {
    const parent = this.requireOwner(userId, parentId);
    if (parent.status === 'cancelled') return parent;
    if (parent.status === 'completed') {
      throw new TradeError('cannot cancel a completed algo', 'trade.algo_bad_state');
    }

    // Collect all child cancels before any status flip. A cancel that does not
    // cancel is worse than a refused cancel — cancelChild must throw when an
    // open child cannot be cancelled (principal missing, venue refuse, …).
    const results = await Promise.allSettled(parent.children.map((child) => this.ports.cancelChild(child.orderId)));
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      const first = failures[0]!.reason;
      const message = first instanceof Error ? first.message : String(first);
      throw new TradeError(
        `algo cancel refused: ${failures.length} of ${parent.children.length} child cancel(s) failed — parent left ${parent.status}: ${message}`,
        first instanceof TradeError && first.code === 'trade.algo_principal_unavailable'
          ? 'trade.algo_principal_unavailable'
          : 'trade.algo_child_cancel_failed',
      );
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
    // ADR 2026-08-08: due time is nextDueAt (re-spaced), never startedAt+index*interval.
    if (now.getTime() < parent.nextDueAt.getTime()) {
      return { kind: 'idle', reason: 'ahead_of_schedule' };
    }

    // Tick outage: active parent was overdue by more than one interval with no
    // user pause. Record distinguishable stretch, then place at most one slice
    // and re-space from this instant (same spacing rule as resume).
    let working = parent;
    const overdueBy = now.getTime() - parent.nextDueAt.getTime();
    if (overdueBy > parent.sliceIntervalMs) {
      const remaining = plan.length - parent.nextSliceIndex;
      working = this.replace(parentId, {
        ...parent,
        scheduleStretchReason: 'tick_outage' satisfies AlgoScheduleStretchReason,
        projectedEndsAt: projectTwapEndsAt(now.getTime(), remaining, parent.sliceIntervalMs),
        // nextDueAt stays ≤ now so this tick may place; re-spaced after event.
      });
    }

    // Mark gate — blank/stale/invalid HALTS (D-S-04 refuse table).
    const mark = await this.ports.markFor(working.marketId);
    if (!mark) {
      const check = algoMarkMissing(working.marketId);
      return this.halt(working, check.reason!, 'trade.algo_mark_missing');
    }
    const markOk = acceptableForAlgo(mark, now, this.markPolicy);
    if (!markOk.ok) {
      const code: AlgoMissCode = markOk.code === 'trade.algo_mark_missing' ? 'trade.algo_mark_missing' : 'trade.algo_mark_unusable';
      return this.halt(working, markOk.reason!, code);
    }

    // Liquidity probe — empty book = miss, not invent fill.
    const opposing = await this.ports.bestOpposingPrice(working.marketId, working.side);
    if (opposing === null) {
      return this.recordMiss(working, {
        sliceIndex: working.nextSliceIndex,
        code: 'trade.algo_no_liquidity',
        reason: `${working.symbol}: no opposing liquidity for slice ${working.nextSliceIndex} — recorded miss, no fill invented`,
        at: now,
      });
    }

    if (!withinPriceBand(working.side, opposing, working.limitPrice)) {
      return this.recordMiss(working, {
        sliceIndex: working.nextSliceIndex,
        code: 'trade.algo_price_band',
        reason:
          `${working.symbol}: opposing ${formatAmount(opposing)} outside limit band ` +
          `${working.limitPrice === null ? 'none' : formatAmount(working.limitPrice)} — slice skipped`,
        at: now,
      });
    }

    const qty = plan[working.nextSliceIndex]!;
    const clientOrderId = `algo:${working.id}:${working.nextSliceIndex}`;

    try {
      const placed = await this.ports.placeChild({
        parentId: working.id,
        sliceIndex: working.nextSliceIndex,
        clientOrderId,
        marketId: working.marketId,
        symbol: working.symbol,
        side: working.side,
        qty,
        limitPrice: working.limitPrice,
        subAccountId: working.subAccountId,
      });

      const child: AlgoChildRef = {
        sliceIndex: working.nextSliceIndex,
        orderId: placed.orderId,
        clientOrderId,
        qty,
        placedAt: now,
      };

      const next = working.nextSliceIndex + 1;
      const remaining = plan.length - next;
      const updated: TwapParent = {
        ...working,
        nextSliceIndex: next,
        children: [...working.children, child],
        // Spacing from the actual place event — not startedAt.
        nextDueAt: new Date(now.getTime() + working.sliceIntervalMs),
        projectedEndsAt: projectTwapEndsAt(now.getTime() + working.sliceIntervalMs, remaining, working.sliceIntervalMs),
        status: next >= plan.length ? 'completed' : working.status,
      };
      this.parents.set(working.id, updated);
      this.emitChange(updated);
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
        return this.halt(working, `insufficient balance mid-schedule: ${message}`, 'trade.algo_insufficient_balance');
      }

      // No authority to act → HALT, and do NOT consume the slice.
      //
      // A miss means "the market would not take this slice"; the schedule
      // advances because that slice's moment has passed. This is a different
      // thing: the venue cannot act for the caller AT ALL, and every remaining
      // slice will fail the same way. Recording it as a miss burned the entire
      // remaining schedule in `sliceIntervalMs × N` and left the parent
      // `completed` having placed nothing — an order silently destroyed by a
      // deploy, and "completed" is the wrong word for it.
      if (err instanceof TradeError && err.code === 'trade.algo_principal_unavailable') {
        return this.halt(working, message, 'trade.algo_principal_unavailable');
      }

      return this.recordMiss(working, {
        sliceIndex: working.nextSliceIndex,
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
    const remaining = plan.length - next;
    const now = miss.at;
    const updated: TwapParent = {
      ...parent,
      nextSliceIndex: next,
      misses: [...parent.misses, miss],
      // Miss still consumes the slot; re-space so overdue misses do not burst.
      nextDueAt: new Date(now.getTime() + parent.sliceIntervalMs),
      projectedEndsAt: projectTwapEndsAt(now.getTime() + parent.sliceIntervalMs, remaining, parent.sliceIntervalMs),
      status: next >= plan.length ? 'completed' : parent.status,
    };
    this.parents.set(parent.id, updated);
    this.emitChange(updated);
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
    this.emitChange(parent);
    return parent;
  }

  private emitChange(parent: TwapParent): void {
    if (!this.onChange) return;
    const plan = this.plans.get(parent.id) ?? [];
    void Promise.resolve(this.onChange(parent, plan)).catch(() => {
      // Persistence failures must not invent progress; next tick retries save.
    });
  }
}
