/**
 * House-book fill → FIX drop-copy ingest (svc-fix POST /internal/drop-copy/fills).
 *
 * Report only. Never posts the ledger. Fill already settled before this runs.
 * Unset ingest URL is off — do not invent a port. HMAC is body-bound v2.
 * Completeness still refuses until every required source publishes (ui is FRONTEND).
 *
 * Source is `rest`: this service is the house REST fill bus. WS/algo/liquidation
 * /rfq/broker still need their own publishers. Do not synthesize `ui`.
 */
import { formatAmount, type Amount } from '@intafaced/ledger-client';
import { serviceAuthHeadersForBody } from '@intafaced/contracts';

export const DROPCOPY_INGEST_PATH = '/internal/drop-copy/fills';
export const DROPCOPY_HOUSE_SOURCE = 'rest' as const;

export type DropCopyFillReport = {
  readonly fillId: string;
  readonly orderId: string;
  readonly userId: string;
  readonly marketId: string;
  readonly side: 'buy' | 'sell';
  readonly price: Amount;
  readonly qty: Amount;
  readonly quoteAmount: Amount;
  readonly feeAsset: string;
  readonly feeAmount: Amount;
  readonly sequence: number;
  readonly ts: string;
};

export interface DropCopyPublisher {
  publish(fill: DropCopyFillReport): Promise<void>;
}

export class NoopDropCopyPublisher implements DropCopyPublisher {
  async publish(): Promise<void> {
    /* unset FIX_DROPCOPY_INGEST_URL — do not invent a listen port */
  }
}

/** Awaited after ledger post; never throws (fill already happened). */
export async function fireDropCopyFill(port: DropCopyPublisher, fill: DropCopyFillReport): Promise<void> {
  try {
    await port.publish(fill);
  } catch {
    /* ingest down / 5xx / timeout — do not unwind the fill */
  }
}

export function dropCopyFillBody(fill: DropCopyFillReport): string {
  return JSON.stringify({
    fillId: fill.fillId,
    orderId: fill.orderId,
    userId: fill.userId,
    marketId: fill.marketId,
    side: fill.side,
    price: formatAmount(fill.price),
    qty: formatAmount(fill.qty),
    quoteAmount: formatAmount(fill.quoteAmount),
    feeAsset: fill.feeAsset,
    feeAmount: formatAmount(fill.feeAmount),
    sequence: fill.sequence,
    ts: fill.ts,
    source: DROPCOPY_HOUSE_SOURCE,
  });
}

const FETCH_MS = 2_000;

/**
 * Blank URL → noop. Non-empty must be an absolute http(s) URL.
 * Path is appended when the owner gave an origin only. Never invents a port.
 */
export function createDropCopyPublisher(ingestUrl: string, internalSecret: string): DropCopyPublisher {
  const trimmed = ingestUrl.trim();
  if (trimmed.length === 0) return new NoopDropCopyPublisher();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('FIX_DROPCOPY_INGEST_URL is not a URL; svc-trade does not invent a drop-copy listen port');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('FIX_DROPCOPY_INGEST_URL is not a URL; svc-trade does not invent a drop-copy listen port');
  }
  const url =
    parsed.pathname === '/' || parsed.pathname === ''
      ? `${parsed.origin}${DROPCOPY_INGEST_PATH}`
      : `${parsed.origin}${parsed.pathname}${parsed.search}`;

  return {
    async publish(fill) {
      const body = dropCopyFillBody(fill);
      if (
        /"price":\s*-?\d/.test(body) ||
        /"qty":\s*-?\d/.test(body) ||
        /"quoteAmount":\s*-?\d/.test(body) ||
        /"feeAmount":\s*-?\d/.test(body)
      ) {
        throw new Error('drop-copy money is a decimal string; svc-trade does not send JSON numbers');
      }
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...serviceAuthHeadersForBody('svc-trade', internalSecret, body),
        },
        body,
        signal: AbortSignal.timeout(FETCH_MS),
      });
      if (response.ok) return;
      throw new Error(`drop-copy ingest refused (${response.status})`);
    },
  };
}
