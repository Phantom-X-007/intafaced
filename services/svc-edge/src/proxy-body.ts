/**
 * Bytes the door forwards upstream.
 *
 * Pay rail webhooks (`/api/pay/webhooks/:railId`) verify HMAC over the raw
 * body. Fastify's default JSON parser hands us an object; `JSON.stringify`
 * of that object changes key order and whitespace, so every honest delivery
 * fails the signature and somebody "fixes" it by relaxing the check.
 *
 * Prefer the original bytes (Buffer / string from a raw parser). Re-serialise
 * only when a test or a leftover parsed object is all we have.
 */
export function upstreamBody(method: string, raw: unknown): Buffer | string | undefined {
  if (method === 'GET' || method === 'HEAD') return undefined;
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return JSON.stringify(raw);
}
