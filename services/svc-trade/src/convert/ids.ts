import { createHash } from 'node:crypto';

/**
 * Convert settle keys (M27). Same derivation as spot/otc ids: a retry computes
 * the same UUID and the ledger returns the original post. Namespace is convert,
 * not otc — the products do not share a money identity.
 */
function derive(namespace: string, name: string): string {
  const digest = createHash('sha256').update(namespace).update('').update(name).digest();
  const bytes = Uint8Array.prototype.slice.call(digest, 0, 16);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function convertSettleIdsFor(quoteId: string): {
  takerOrderId: string;
  makerOrderId: string;
  fillId: string;
} {
  return {
    takerOrderId: derive('intafaced.trade.convert.order', `${quoteId}:taker`),
    makerOrderId: derive('intafaced.trade.convert.order', `${quoteId}:maker`),
    fillId: derive('intafaced.trade.convert.fill', quoteId),
  };
}
