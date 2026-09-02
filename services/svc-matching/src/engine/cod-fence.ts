/**
 * D-cod fence wrap. MatchingEngine.prototype mill when engine.ts stays on main
 * (40k PUT drops content). Per-id cancel, split-brain, dual-control kill.
 */
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';
import { formatAmount } from '@intafaced/ledger-client/money';
import { withEngineSpan, withSpan } from '../tracing.js';
import { MatchingEngine } from './engine.js';
import { dualControlRefuse, readConfirmOperatorId, readOperatorId } from './halt.js';
import {
  cancelIdsIndependently,
  liveOwnedFromState,
  massCancelSessionRefuse,
  ownedOrderIds,
  readMassCancelSide,
  readSessionId,
} from './mass-cancel.js';
import { liveSessionFromState, missingSessionRefuse, sessionOrderIds } from './session.js';
import { replaySplitBrain, splitBrainAmendResult, splitBrainSubmitResult } from './split-brain.js';
import type {
  AmendResult,
  CancelledRef,
  EngineAmend,
  EngineOrder,
  MarketId,
  MassCancelResult,
  OrderId,
  OrderSide,
  SessionDeadResult,
  SplitBrainResult,
  SubmitResult,
  VenueKillResult,
} from './types.js';

declare module './engine.js' {
  interface MatchingEngine {
    readonly isSplitBrain: boolean;
    declareSplitBrain(cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null }): Promise<SplitBrainResult>;
    clearSplitBrain(cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null }): Promise<SplitBrainResult>;
  }
}

type PendingCancelled = {
  readonly sequence: number;
  readonly name: 'orderCancelled';
  readonly payload: { readonly orderId: OrderId; readonly marketId: MarketId; readonly remainingQty: string; readonly sequence: number };
  readonly key: string;
};

type Fence = MatchingEngine & {
  splitBrain: boolean;
  venueHalted: boolean;
  books: Map<
    MarketId,
    {
      cancel: (orderId: OrderId, reason?: string) => { readonly cancellation: CancelledRef | null };
      toState: () => Parameters<typeof liveOwnedFromState>[0];
    }
  >;
  journal: { append: (command: Record<string, unknown>) => void; read: () => readonly { readonly kind: string }[]; length: number };
  clock: () => Date;
  deadSessions: Set<string>;
  emit: (events: readonly PendingCancelled[]) => Promise<void>;
  dropIfNeverTraded: (marketId: MarketId) => void;
  maybeSnapshot: () => Promise<void>;
};

function cancelledEvent(marketId: MarketId, cancellation: CancelledRef): PendingCancelled {
  return {
    sequence: cancellation.sequence,
    name: 'orderCancelled',
    payload: {
      orderId: cancellation.orderId,
      marketId,
      remainingQty: formatAmount(cancellation.remainingQty),
      sequence: cancellation.sequence,
    },
    key: `matching.order.cancelled:${marketId}:${cancellation.sequence}`,
  };
}

function install(): void {
  const ME = MatchingEngine;
  if (typeof ME !== 'function') {
    queueMicrotask(install);
    return;
  }
  const proto = ME.prototype as Fence;
  if (Object.prototype.hasOwnProperty.call(proto, 'declareSplitBrain')) return;

  const origSubmit = proto.submit;
  const origAmend = proto.amend;
  const origRecover = proto.recover;

  Object.defineProperty(proto, 'isSplitBrain', {
    configurable: true,
    enumerable: false,
    get(this: Fence): boolean {
      return this.splitBrain === true;
    },
  });

  proto.recover = function (this: Fence): { records: number; markets: number } {
    this.splitBrain = false;
    const result = origRecover.call(this);
    this.splitBrain = replaySplitBrain(this.journal.read());
    return result;
  };

  proto.submit = async function (
    this: Fence,
    marketId: MarketId,
    order: EngineOrder,
    lifecycleProof?: MarketLifecycleAdmissionProof,
  ): Promise<SubmitResult> {
    if (this.splitBrain) {
      const result = splitBrainSubmitResult(order.orderId);
      return { ...result, fillCount: 0, rejectCode: result.rejected?.code } as SubmitResult;
    }
    return origSubmit.call(this, marketId, order, lifecycleProof);
  };

  proto.amend = async function (
    this: Fence,
    marketId: MarketId,
    cmd: EngineAmend,
    lifecycleProof?: MarketLifecycleAdmissionProof,
  ): Promise<AmendResult> {
    if (this.splitBrain) {
      const result = splitBrainAmendResult(cmd.orderId);
      return { ...result, fillCount: 0, rejectCode: result.rejected?.code } as AmendResult;
    }
    return origAmend.call(this, marketId, cmd, lifecycleProof);
  };

  proto.massCancel = async function (
    this: Fence,
    marketId: MarketId,
    cmd: { readonly accountId: string; readonly sessionId?: string | null; readonly side?: OrderSide | null },
  ): Promise<MassCancelResult> {
    return withEngineSpan('matching.massCancel', { marketId }, async (): Promise<MassCancelResult & { fillCount: number }> => {
      const sessionRefuse = massCancelSessionRefuse(readSessionId(cmd));
      if (sessionRefuse) {
        return {
          accepted: false,
          accountId: cmd.accountId,
          cancellations: [],
          failed: [],
          rejected: { code: sessionRefuse.code, message: sessionRefuse.message },
          fillCount: 0,
        };
      }

      const existing = this.existingBook(marketId);
      if (!existing) {
        return { accepted: true, accountId: cmd.accountId, cancellations: [], failed: [], fillCount: 0 };
      }

      const side = readMassCancelSide(cmd);
      const ids = ownedOrderIds(cmd.accountId, liveOwnedFromState(existing.toState()), side);
      const at = this.clock().toISOString();
      this.journal.append({
        kind: 'mass_cancel',
        marketId,
        at,
        accountId: cmd.accountId,
        ...(side ? { side } : {}),
      });

      const { cancellations, failed } = cancelIdsIndependently((orderId) => existing.cancel(orderId), ids);
      this.dropIfNeverTraded(marketId);
      if (cancellations.length > 0) {
        await this.emit(cancellations.map((cancellation) => cancelledEvent(marketId, cancellation)));
      }
      await this.maybeSnapshot();

      return { accepted: true, accountId: cmd.accountId, cancellations, failed, fillCount: 0 };
    });
  };

  proto.sessionDead = async function (this: Fence, cmd: { readonly sessionId?: string | null }): Promise<SessionDeadResult> {
    return withSpan('matching.session_dead', async (): Promise<SessionDeadResult & { fillCount: number }> => {
      const sessionId = readSessionId(cmd);
      if (sessionId === null) {
        return {
          accepted: false,
          sessionId: null,
          cancellations: [],
          failed: [],
          rejected: missingSessionRefuse(),
          fillCount: 0,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'session_dead', at, sessionId });
      this.deadSessions.add(sessionId);

      const cancellations: CancelledRef[] = [];
      const failed: SessionDeadResult['failed'] = [];
      const events: PendingCancelled[] = [];
      for (const marketId of [...this.books.keys()].sort()) {
        const book = this.books.get(marketId);
        if (!book) continue;
        const ids = sessionOrderIds(sessionId, liveSessionFromState(book.toState()));
        const pulled = cancelIdsIndependently((orderId) => book.cancel(orderId, 'session_dead'), ids);
        for (const cancellation of pulled.cancellations) {
          cancellations.push(cancellation);
          events.push(cancelledEvent(marketId, cancellation));
        }
        failed.push(...pulled.failed);
        this.dropIfNeverTraded(marketId);
      }
      if (events.length > 0) await this.emit(events);
      await this.maybeSnapshot();

      return { accepted: true, sessionId, cancellations, failed, fillCount: 0 };
    });
  };

  proto.haltAll = async function (
    this: Fence,
    cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null },
  ): Promise<VenueKillResult> {
    return withSpan('matching.halt_all', async () => {
      const operatorId = readOperatorId(cmd);
      const confirmOperatorId = readConfirmOperatorId(cmd);
      const refuse = dualControlRefuse(operatorId, confirmOperatorId);
      if (refuse) {
        return {
          accepted: false,
          halted: this.venueHalted,
          operatorId,
          confirmOperatorId,
          rejected: refuse,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'halt_all', at, operatorId: operatorId!, confirmOperatorId: confirmOperatorId! });
      this.venueHalted = true;
      return { accepted: true, halted: true, operatorId, confirmOperatorId };
    });
  };

  proto.resumeAll = async function (
    this: Fence,
    cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null },
  ): Promise<VenueKillResult> {
    return withSpan('matching.resume_all', async () => {
      const operatorId = readOperatorId(cmd);
      const confirmOperatorId = readConfirmOperatorId(cmd);
      const refuse = dualControlRefuse(operatorId, confirmOperatorId);
      if (refuse) {
        return {
          accepted: false,
          halted: this.venueHalted,
          operatorId,
          confirmOperatorId,
          rejected: refuse,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'resume_all', at, operatorId: operatorId!, confirmOperatorId: confirmOperatorId! });
      this.venueHalted = false;
      return { accepted: true, halted: false, operatorId, confirmOperatorId };
    });
  };

  proto.declareSplitBrain = async function (
    this: Fence,
    cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null },
  ): Promise<SplitBrainResult> {
    return withSpan('matching.split_brain', async () => {
      const operatorId = readOperatorId(cmd);
      const confirmOperatorId = readConfirmOperatorId(cmd);
      const refuse = dualControlRefuse(operatorId, confirmOperatorId);
      if (refuse) {
        return {
          accepted: false,
          splitBrain: this.splitBrain === true,
          operatorId,
          confirmOperatorId,
          rejected: refuse,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'split_brain', at, operatorId: operatorId!, confirmOperatorId: confirmOperatorId! });
      this.splitBrain = true;
      return { accepted: true, splitBrain: true, operatorId, confirmOperatorId };
    });
  };

  proto.clearSplitBrain = async function (
    this: Fence,
    cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null },
  ): Promise<SplitBrainResult> {
    return withSpan('matching.clear_split_brain', async () => {
      const operatorId = readOperatorId(cmd);
      const confirmOperatorId = readConfirmOperatorId(cmd);
      const refuse = dualControlRefuse(operatorId, confirmOperatorId);
      if (refuse) {
        return {
          accepted: false,
          splitBrain: this.splitBrain === true,
          operatorId,
          confirmOperatorId,
          rejected: refuse,
        };
      }

      const at = this.clock().toISOString();
      this.journal.append({ kind: 'clear_split_brain', at, operatorId: operatorId!, confirmOperatorId: confirmOperatorId! });
      this.splitBrain = false;
      return { accepted: true, splitBrain: false, operatorId, confirmOperatorId };
    });
  };
}

queueMicrotask(install);
