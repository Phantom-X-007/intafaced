/**
 * In-memory EMS order-ack journal — clientOrderId → venue execution state.
 *
 * Records venue acks from the execute path only. Does not invent fills or
 * statuses. Missing entry is an honest miss, not a synthetic ack.
 */
import type { VenueExecution } from '@intafaced/venue-adapter';

export type EmsOrderAck = {
  readonly clientOrderId: string;
  readonly venueId: string;
  readonly symbol: string;
  readonly side: 'buy' | 'sell';
  readonly execution: VenueExecution;
  readonly recordedAtMs: number;
};

export type EmsListFilter = {
  readonly venueId?: string;
  readonly symbol?: string;
};

export interface EmsOrderStore {
  record(input: Omit<EmsOrderAck, 'recordedAtMs'> & { readonly recordedAtMs?: number }): void;
  get(clientOrderId: string): EmsOrderAck | null;
  list(filter?: EmsListFilter): readonly EmsOrderAck[];
}

export class InMemoryEmsOrderStore implements EmsOrderStore {
  private readonly byClientOrderId = new Map<string, EmsOrderAck>();

  record(input: Omit<EmsOrderAck, 'recordedAtMs'> & { readonly recordedAtMs?: number }): void {
    const clientOrderId = input.clientOrderId.trim();
    if (!clientOrderId) return;
    this.byClientOrderId.set(clientOrderId, {
      clientOrderId,
      venueId: input.venueId,
      symbol: input.symbol,
      side: input.side,
      execution: input.execution,
      recordedAtMs: input.recordedAtMs ?? Date.now(),
    });
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
