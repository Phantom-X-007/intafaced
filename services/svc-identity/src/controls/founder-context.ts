import { createEdgeContext, rawBodyOf, verifyServiceHeaders, type EdgeContextOptions, type EdgeRequest } from '@intafaced/contracts';

/** Preserve rawBodyOf(req); the two delegated POST reads require a body-bound service HMAC. */
export function createIdentityRequestContext(options: EdgeContextOptions) {
  const regular = createEdgeContext(options);
  return (req: EdgeRequest & { url: string; body?: unknown }) => {
    const context = regular(req);
    let procedures: string[];
    try {
      procedures =
        decodeURIComponent(req.url.split('?')[0] ?? '')
          .split('/')
          .at(-1)
          ?.split(',') ?? [];
    } catch {
      return { ...context, service: null };
    }
    const requiresBody = procedures.some(
      (name) => name === 'accountControls.operatorEntitlement' || name === 'accountControls.currentAuthority',
    );
    if (!requiresBody) return context;
    // The tRPC Fastify adapter replaces the shared JSON parser and preserves
    // incoming UTF-8 text in req.body. Bind that exact text, never reserialize
    // an already-parsed object. Other body shapes must have retained bytes.
    const rawBody = typeof req.body === 'string' ? { retained: true as const, bytes: Buffer.from(req.body, 'utf8') } : rawBodyOf(req);
    const service = options.internalSecret
      ? verifyServiceHeaders(req.headers, options.internalSecret, { mode: 'require', rawBody }).service
      : null;
    return { ...context, service };
  };
}
