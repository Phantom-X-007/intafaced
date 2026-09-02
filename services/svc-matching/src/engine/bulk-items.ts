/**
 * Bulk place/amend/cancel (PX-S03 §11 / PTX-M04-R03).
 * Non-atomic by default. Atomic is explicit all-or-none. Per-item APPLIED/REFUSED/OUTCOME_UNKNOWN.
 * Partial bulk cannot hide rejects. commandId idempotency. Do not invent a flatten or a hold.
 * Hitch: imported from index.ts so MatchingEngine is wrapped without recutting engine.ts.
 */
import { MatchingEngine } from './engine.js';
import type {
  AmendResult,
  BulkCommandResult,
  BulkItemResult,
  CancelResult,
  EngineAmend,
  EngineOrder,
  MarketId,
  OrderId,
  RejectReason,
  SubmitResult,
} from './types.js';

export const BULK_COMMAND_MISSING = 'bulk_command_missing' as const;
export const BULK_ATOMIC_PARTIAL = 'bulk_atomic_partial' as const;
export const BULK_COMMAND_MISSING_MESSAGE = 'bulk commandId is required';
export const BULK_ATOMIC_PARTIAL_MESSAGE = 'atomic group refused; applied item was unwound so the book is not partial';

const FLAG = Symbol.for('intafaced.matching.bulk-items');
const STORE = Symbol.for('intafaced.matching.bulk-items.store');

export type BulkControl = {
  readonly commandId?: string | null;
  readonly atomic?: boolean;
  readonly actor?: string | null;
  readonly grant?: string | null;
  readonly session?: string | null;
  readonly scope?: string | null;
  readonly expectedPolicyVersion?: string | null;
  readonly deadline?: string | null;
  readonly targetSnapshot?: string | null;
  readonly selector?: string | null;
  readonly mode?: string | null;
};

export type BulkPlaceItem = {
  readonly marketId: MarketId;
  readonly order: EngineOrder;
};

export type BulkAmendItem = {
  readonly marketId: MarketId;
  readonly amend: EngineAmend;
};

export type BulkCancelItem = {
  readonly marketId: MarketId;
  readonly orderId: OrderId;
};

export type BulkPlaceCommand = BulkControl & { readonly items: readonly BulkPlaceItem[] };
export type BulkAmendCommand = BulkControl & { readonly items: readonly BulkAmendItem[] };
export type BulkCancelCommand = BulkControl & { readonly items: readonly BulkCancelItem[] };

type BulkKind = 'place' | 'amend' | 'cancel';

type Host = MatchingEngine & {
  [STORE]?: Map<string, BulkCommandResult>;
  submit: (marketId: MarketId, order: EngineOrder, proof?: unknown) => Promise<SubmitResult>;
  amend: (marketId: MarketId, cmd: EngineAmend, proof?: unknown) => Promise<AmendResult>;
  cancel: (marketId: MarketId, orderId: OrderId) => Promise<CancelResult>;
};

function storeOf(engine: MatchingEngine): Map<string, BulkCommandResult> {
  const host = engine as Host;
  if (!host[STORE]) host[STORE] = new Map();
  return host[STORE];
}

function readCommandId(cmd: BulkControl): string | null {
  if (typeof cmd.commandId !== 'string') return null;
  const trimmed = cmd.commandId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readAtomic(cmd: BulkControl): boolean {
  return cmd.atomic === true;
}

function commandMissingRefuse(): RejectReason {
  return { code: BULK_COMMAND_MISSING, message: BULK_COMMAND_MISSING_MESSAGE };
}

function atomicPartialRefuse(): RejectReason {
  return { code: BULK_ATOMIC_PARTIAL, message: BULK_ATOMIC_PARTIAL_MESSAGE };
}

function orderNotFoundRefuse(marketId: MarketId, orderId: OrderId): RejectReason {
  return { code: 'order_not_found', message: `order ${orderId} is not live in ${marketId}` };
}

function unknownOutcome(index: number, orderId?: OrderId): BulkItemResult {
  return orderId === undefined ? { index, status: 'OUTCOME_UNKNOWN' } : { index, status: 'OUTCOME_UNKNOWN', orderId };
}

function applied(index: number, orderId: OrderId): BulkItemResult {
  return { index, status: 'APPLIED', orderId };
}

function refused(index: number, reason: RejectReason, orderId?: OrderId): BulkItemResult {
  return orderId === undefined ? { index, status: 'REFUSED', rejected: reason } : { index, status: 'REFUSED', orderId, rejected: reason };
}

function finish(commandId: string | null, atomic: boolean, results: readonly BulkItemResult[]): BulkCommandResult {
  return { commandId, atomic, results };
}

function isLive(engine: MatchingEngine, marketId: MarketId, orderId: OrderId): boolean {
  return engine.restingOrders(marketId).some((row) => row.orderId === orderId);
}

function replayStored(engine: MatchingEngine, kind: BulkKind, commandId: string): BulkCommandResult | null {
  return storeOf(engine).get(`${kind}:${commandId}`) ?? null;
}

function remember(engine: MatchingEngine, kind: BulkKind, commandId: string, result: BulkCommandResult): BulkCommandResult {
  storeOf(engine).set(`${kind}:${commandId}`, result);
  return result;
}

function missingCommandResults(items: readonly unknown[], atomic: boolean): BulkCommandResult {
  const reason = commandMissingRefuse();
  const results = items.map((_, index) => refused(index, reason));
  return finish(null, atomic, results);
}

async function placeOne(engine: Host, index: number, item: BulkPlaceItem): Promise<BulkItemResult> {
  const orderId = item.order.orderId;
  try {
    const result = await engine.submit(item.marketId, item.order);
    if (result.accepted) return applied(index, orderId);
    if (result.rejected) return refused(index, result.rejected, orderId);
    return unknownOutcome(index, orderId);
  } catch {
    return unknownOutcome(index, orderId);
  }
}

async function amendOne(engine: Host, index: number, item: BulkAmendItem): Promise<BulkItemResult> {
  const orderId = item.amend.orderId;
  try {
    const result = await engine.amend(item.marketId, item.amend);
    if (result.accepted) return applied(index, orderId);
    if (result.rejected) return refused(index, result.rejected, orderId);
    return unknownOutcome(index, orderId);
  } catch {
    return unknownOutcome(index, orderId);
  }
}

async function cancelOne(engine: Host, index: number, item: BulkCancelItem): Promise<BulkItemResult> {
  const orderId = item.orderId;
  try {
    const result = await engine.cancel(item.marketId, orderId);
    if (result.cancelled) return applied(index, orderId);
    if (result.rejected) return refused(index, result.rejected, orderId);
    return refused(index, orderNotFoundRefuse(item.marketId, orderId), orderId);
  } catch {
    return unknownOutcome(index, orderId);
  }
}

async function unwindPlace(engine: Host, item: BulkPlaceItem, current: BulkItemResult): Promise<BulkItemResult> {
  if (current.status !== 'APPLIED' || current.orderId === undefined) {
    return current.status === 'APPLIED' ? unknownOutcome(current.index) : current;
  }
  const orderId = current.orderId;
  try {
    const cancelled = await engine.cancel(item.marketId, orderId);
    if (isLive(engine, item.marketId, orderId)) return unknownOutcome(current.index, orderId);
    if (cancelled.cancelled || !isLive(engine, item.marketId, orderId)) {
      return refused(current.index, atomicPartialRefuse(), orderId);
    }
    return unknownOutcome(current.index, orderId);
  } catch {
    if (isLive(engine, item.marketId, orderId)) return unknownOutcome(current.index, orderId);
    return refused(current.index, atomicPartialRefuse(), orderId);
  }
}

async function processPlace(engine: Host, cmd: BulkPlaceCommand): Promise<BulkCommandResult> {
  const atomic = readAtomic(cmd);
  const items = Array.isArray(cmd.items) ? cmd.items : [];
  const commandId = readCommandId(cmd);
  if (commandId === null) return missingCommandResults(items, atomic);
  const cached = replayStored(engine, 'place', commandId);
  if (cached) return cached;

  const results: BulkItemResult[] = [];
  for (let index = 0; index < items.length; index += 1) {
    results.push(await placeOne(engine, index, items[index]!));
  }
  if (atomic && results.some((row) => row.status !== 'APPLIED')) {
    for (let index = 0; index < results.length; index += 1) {
      results[index] = await unwindPlace(engine, items[index]!, results[index]!);
    }
  }
  return remember(engine, 'place', commandId, finish(commandId, atomic, results));
}

async function processAmend(engine: Host, cmd: BulkAmendCommand): Promise<BulkCommandResult> {
  const atomic = readAtomic(cmd);
  const items = Array.isArray(cmd.items) ? cmd.items : [];
  const commandId = readCommandId(cmd);
  if (commandId === null) return missingCommandResults(items, atomic);
  const cached = replayStored(engine, 'amend', commandId);
  if (cached) return cached;

  if (atomic) {
    const blocked = items.map((item, index) => {
      const orderId = item.amend?.orderId;
      if (!orderId || !isLive(engine, item.marketId, orderId)) {
        return refused(index, orderNotFoundRefuse(item.marketId, orderId ?? ''), orderId);
      }
      return null;
    });
    if (blocked.some((row) => row !== null)) {
      const results = blocked.map((row, index) => row ?? refused(index, atomicPartialRefuse(), items[index]!.amend.orderId));
      return remember(engine, 'amend', commandId, finish(commandId, atomic, results));
    }
  }

  const results: BulkItemResult[] = [];
  for (let index = 0; index < items.length; index += 1) {
    results.push(await amendOne(engine, index, items[index]!));
  }
  if (atomic && results.some((row) => row.status !== 'APPLIED')) {
    for (let index = 0; index < results.length; index += 1) {
      const current = results[index]!;
      if (current.status !== 'APPLIED') continue;
      results[index] = unknownOutcome(current.index, current.orderId);
    }
  }
  return remember(engine, 'amend', commandId, finish(commandId, atomic, results));
}

async function processCancel(engine: Host, cmd: BulkCancelCommand): Promise<BulkCommandResult> {
  const atomic = readAtomic(cmd);
  const items = Array.isArray(cmd.items) ? cmd.items : [];
  const commandId = readCommandId(cmd);
  if (commandId === null) return missingCommandResults(items, atomic);
  const cached = replayStored(engine, 'cancel', commandId);
  if (cached) return cached;

  if (atomic) {
    const blocked = items.map((item, index) =>
      isLive(engine, item.marketId, item.orderId) ? null : refused(index, orderNotFoundRefuse(item.marketId, item.orderId), item.orderId),
    );
    if (blocked.some((row) => row !== null)) {
      const results = blocked.map((row, index) => row ?? refused(index, atomicPartialRefuse(), items[index]!.orderId));
      return remember(engine, 'cancel', commandId, finish(commandId, atomic, results));
    }
  }

  const results: BulkItemResult[] = [];
  for (let index = 0; index < items.length; index += 1) {
    results.push(await cancelOne(engine, index, items[index]!));
  }
  return remember(engine, 'cancel', commandId, finish(commandId, atomic, results));
}

export function installBulkItems(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    bulkPlace?: (cmd: BulkPlaceCommand) => Promise<BulkCommandResult>;
    bulkAmend?: (cmd: BulkAmendCommand) => Promise<BulkCommandResult>;
    bulkCancel?: (cmd: BulkCancelCommand) => Promise<BulkCommandResult>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  proto.bulkPlace = async function (this: MatchingEngine, cmd: BulkPlaceCommand) {
    return processPlace(this as Host, cmd);
  };
  proto.bulkAmend = async function (this: MatchingEngine, cmd: BulkAmendCommand) {
    return processAmend(this as Host, cmd);
  };
  proto.bulkCancel = async function (this: MatchingEngine, cmd: BulkCancelCommand) {
    return processCancel(this as Host, cmd);
  };
}

try {
  installBulkItems();
} catch {
  queueMicrotask(() => installBulkItems());
}
