/**
 * trade.futures — capability note for bots (GET /api/v1/capabilities).
 *
 * A listed perp is not orderable and does not run funding/liq ticks by default.
 * Realised-profit pot is unnamed by default (N1). D3 ladder numbers stay unset.
 * This does not start jobs, enable orders, name a pot, or invent rates / D2 ceilings.
 */
export type { FuturesJobsCapabilityNote } from './futures-policy.js';
export { presentFuturesJobsCapabilityNote } from './futures-policy.js';
