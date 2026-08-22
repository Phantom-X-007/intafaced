/**
 * File-backed EMS order-ack journal — survives process restart (D29).
 *
 * JSONL append-only log. Missing file is an honest empty journal, not invented acks.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { formatAmount, parseAmount } from '@intafaced/ledger-client';
import type { EmsOrderAck, EmsOrderStore, EmsListFilter } from './oms-ems-store.js';

type StoredLine = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly execution: {
    readonly venueId: string;
    readonly venueOrderId: string;
    readonly filledAmount: string;
    readonly averagePrice: string;
    readonly feeAmount: string;
    readonly feeAsset: string;
    readonly status: 'filled' | 'partial' | 'rejected';
    readonly executedAt: string;
  };
  readonly recordedAtMs: number;
};

function toStoredLine(ack: EmsOrderAck): StoredLine {
  return {
    clientOrderId: ack.clientOrderId,
    venueId: ack.venueId,
    symbol: ack.symbol,
    side: ack.side,
    execution: {
      venueId: ack.execution.venueId,
      venueOrderId: ack.execution.venueOrderId,
      filledAmount: formatAmount(ack.execution.filledAmount),
      averagePrice: formatAmount(ack.execution.averagePrice),
      feeAmount: formatAmount(ack.execution.feeAmount),
      feeAsset: ack.execution.feeAsset,
      status: ack.execution.status,
      executedAt: ack.execution.executedAt instanceof Date ? ack.execution.executedAt.toISOString() : String(ack.execution.executedAt),
    },
    recordedAtMs: ack.recordedAtMs,
  };
}

function fromStoredLine(line: StoredLine): EmsOrderAck {
  return {
    clientOrderId: line.clientOrderId,
    venueId: line.venueId,
    symbol: line.symbol,
    side: line.side,
    execution: {
      venueId: line.execution.venueId,
      venueOrderId: line.execution.venueOrderId,
      filledAmount: parseAmount(line.execution.filledAmount),
      averagePrice: parseAmount(line.execution.averagePrice),
      feeAmount: parseAmount(line.execution.feeAmount),
      feeAsset: line.execution.feeAsset,
      status: line.execution.status,
      executedAt: new Date(line.execution.executedAt),
    },
    recordedAtMs: line.recordedAtMs,
  };
}

function normalizeAck(input: Omit<EmsOrderAck, 'recordedAtMs'> & { readonly recordedAtMs?: number }): EmsOrderAck | null {
  const clientOrderId = input.clientOrderId.trim();
  if (!clientOrderId) return null;
  return {
    clientOrderId,
    venueId: input.venueId,
    symbol: input.symbol,
    side: input.side,
    execution: input.execution,
    recordedAtMs: input.recordedAtMs ?? Date.now(),
  };
}

export class FileEmsOrderStore implements EmsOrderStore {
  private readonly byClientOrderId = new Map<string, EmsOrderAck>();

  constructor(private readonly filePath: string) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = JSON.parse(trimmed) as StoredLine;
        const ack = fromStoredLine(parsed);
        this.byClientOrderId.set(ack.clientOrderId, ack);
      }
    }
  }

  record(input: Omit<EmsOrderAck, 'recordedAtMs'> & { readonly recordedAtMs?: number }): void {
    const ack = normalizeAck(input);
    if (!ack) return;
    this.byClientOrderId.set(ack.clientOrderId, ack);
    appendFileSync(this.filePath, `${JSON.stringify(toStoredLine(ack))}\n`, 'utf8');
  }

  get(clientOrderId: string): EmsOrderAck | null {
    const id = clientOrderId.trim();
    if (!id) return null;
    return this.byClientOrderId.get(id) ?? null;
  }

  list(filter: EmsListFilter = {}): readonly EmsOrderAck[] {
    let rows = [...this.byClientOrderId.values()];
    const venueId = filter.venueId?.trim();
    const symbol = filter.symbol?.trim();
    if (venueId) rows = rows.filter((row) => row.venueId === venueId);
    if (symbol) rows = rows.filter((row) => row.symbol === symbol);
    return rows;
  }
}
