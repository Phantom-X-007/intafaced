/**
 * D-cod hitch wrap. Mill engine.ts PUT truncates; keep origin mill intact and
 * patch MatchingEngine for per-id mass-cancel, session-dead continue-on-throw,
 * split-brain submit/amend refuse, and dual-control haltAll/resumeAll.
 */
import { formatAmount } from '@intafaced/ledger-client/money';
import { withSpan } from '../tracing.js';
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
  MassCancelFailure,
  MassCancelResult,
  OrderId,
  OrderSide,
  SessionDeadResult,
  SplitBrainResult,
  SubmitResult,
  VenueKillResult,
} from './types.js';
import type { MarketLifecycleAdmissionProof } from '@intafaced/exchange-contract';

type PendingEvent = {
  readonly sequence: number;
  readonly name: 'orderCancelled';
  readonly payload: {
    readonly orderId: OrderId;
    readonly marketId: MarketId;
    readonly remainingQty: string;
    readonly sequence: number;
  };
  readonly key: string;
};

type FenceBook = {
  toState: () => Parameters<typeof liveOwnedFromState>[0];
  cancel: (orderId: OrderId, reason?: string) => { cancellation: CancelledRef | null };
  isNeverPrintedEmpty: boolean;
};

type FenceEngine = {
  enabled: boolean;
  splitBrain: boolean;
  venueHalted: boolean;
  books: Map<MarketId, FenceBook>;
  journal: {
    append: (command: Record<string, unknown>) => void;
    read: () => readonly { readonly kind: string }[];
    readonly length: number;
  };
  clock: () => Date;
  deadSessions: Set<string>;
  existingBook: (marketId: MarketId) => FenceBook | null;
  dropIfNeverTraded: (marketId: MarketId) => void;
  emit: (events: readonly PendingEvent[]) => Promise<void>;
  maybeSnapshot: () => Promise<void>;
  recover: () => { records: number; markets: number };
  submit: (marketId: MarketId, order: EngineOrder, lifecycleProof?: MarketLifecycleAdmissionProof) => Promise<SubmitResult>;
  amend: (marketId: MarketId, cmd: EngineAmend, lifecycleProof?: MarketLifecycleAdmissionProof) => Promise<AmendResult>;
};

function cancelledEvent(marketId: MarketId, cancellation: CancelledRef): PendingEvent {
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

function applyCodFence(Engine: typeof MatchingEngine): void {
  const proto = Engine.prototype as unknown as FenceEngine & {
    massCancel: (
      marketId: MarketId,
      cmd: { readonly accountId: string; readonly sessionId?: string | null; readonly side?: OrderSide | null },
    ) => Promise<MassCancelResult>;
    sessionDead: (cmd: { readonly sessionId?: string | null }) => Promise<SessionDeadResult>;
    haltAll: (cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null }) => Promise<VenueKillResult>;
    resumeAll: (cmd: { readonly operatorId?: string | null; readonly confirmOperatorId?: string | null }) => Promise<VenueKillResult>;
    declareSplitBrain: (cmd: {
      readonly operatorId?: string | null;
      readonly confirmOperatorId?: string | null;
    }) => Promise<SplitBrainResult>;
    clearSplitBrain: (cmd: {
      readonly operatorId?: string | null;
      readonly confirmOperatorId?: string | null;
    }) => Promise<SplitBrainResult>;
    isSplitBrain: boolean;
  };

  const origRecover = proto.recover;
  proto.recover = function recover(this: FenceEngine) {
    this.splitBrain = false;
    const result = origRecover.call(this);
    this.splitBrain = replaySplitBrain(this.journal.read());
    return result;
  };

  Object.defineProperty(proto, 'isSplitBrain', {
    configurable: true,
    enumerable: false,
    get(this: FenceEngine): boolean {
      return this.splitBrain === true;
    },
  });

  const origSubmit = proto.submit;
  proto.submit = async function submit(
    this: FenceEngine,
    marketId: MarketId,
    order: EngineOrder,
    lifecycleProof?: MarketLifecycleAdmissionProof,
  ): Promise<SubmitResult> {
    if (this.enabled && this.splitBrain === true) {
      const result = splitBrainSubmitResult(order.orderId);
      return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
    }
    return origSubmit.call(this, marketId, order, lifecycleProof);
  };

  const origAmend = proto.amend;
  proto.amend = async function amend(
    this: FenceEngine,
    marketId: MarketId,
    cmd: EngineAmend,
    lifecycleProof?: MarketLifecycleAdmissionProof,
  ): Promise<AmendResult> {
    if (this.enabled && this.splitBrain === true) {
      const result = splitBrainAmendResult(cmd.orderId);
      return { ...result, fillCount: 0, rejectCode: result.rejected?.code };
    }
    return origAmend.call(this, marketId, cmd, lifecycleProof);
  };

  proto.massCancel = async function massCancel(
    this: FenceEngine,
    marketId: MarketId,
    cmd: { readonly accountId: string; readonly sessionId?: string | null; readonly side?: OrderSide | null },
  ): Promise<MassCancelResult> {
    const sessionRefuse = massCancelSessionRefuse(readSessionId(cmd));
    if (sessionRefuse) {
      return {
        accepted: false,
        accountId: cmd.accountId,
        cancellations: [],
        failed: [],
        rejected: { code: sessionRefuse.code, message: sessionRefuse.message },
        fillCount: 0,
      } as MassCancelResult & { fillCount: number };
    }

    const existing = this.existingBook(marketId);
    if (!existing) {
      return { accepted: true, accountId: cmd.accountId, cancellations: [], failed: [], fillCount: 0 } as MassCancelResult & {
        fillCount: number;
      };
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

    return { accepted: true, accountId: cmd.accountId, cancellations, failed, fillCount: 0 } as MassCancelResult & { fillCount: number };
  };

  proto.sessionDead = async function sessionDead(
    this: FenceEngine,
    cmd: { readonly sessionId?: string | null },
  ): Promise<SessionDeadResult> {
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
      const failed: MassCancelFailure[] = [];
      const events: PendingEvent[] = [];
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

  proto.haltAll = async function haltAll(
    this: FenceEngine,
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

  proto.resumeAll = async function resumeAll(
    this: FenceEngine,
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

  proto.declareSplitBrain = async function declareSplitBrain(
    this: FenceEngine,
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

  proto.clearSplitBrain = async function clearSplitBrain(
    this: FenceEngine,
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

function hitch(): void {
  if (typeof MatchingEngine === 'function') {
    applyCodFence(MatchingEngine);
    return;
  }
  queueMicrotask(hitch);
}

hitch();
