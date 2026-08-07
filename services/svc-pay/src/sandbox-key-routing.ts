import { PayError } from './payment-service.js';

/**
 * pay.public-api step 4 — sandbox keys (ADR 2026-08-07 §2.5).
 *
 * Sandbox is a rail posture, not a second deployment. A sandbox principal
 * routes to the sandbox rail; a live principal may not name one.
 * `assertRailMayMoveValue` remains the second gate for value-leaving
 * capabilities — this helper is the REST translation that picks the rail
 * before PayService runs.
 *
 * No invent rates. No live acquirer. No parallel sandbox stack.
 */

export type KeyEnv = 'live' | 'sandbox';

/** Known sandbox rail id used by the card sandbox adapter. */
export const DEFAULT_SANDBOX_RAIL_ID = 'card-sandbox';

/**
 * Heuristic for "this rail id is a sandbox simulation".
 *
 * Prefer exact id match; also catch the `*-sandbox` naming convention used
 * by fixtures. Live adapters must never use that suffix.
 */
export function isSandboxRailId(railId: string): boolean {
  if (railId === DEFAULT_SANDBOX_RAIL_ID) return true;
  return railId.endsWith('-sandbox');
}

/**
 * Resolve which rail a merchant REST createPayment may use, given the
 * principal's key environment and the rail the body named.
 *
 * - `sandbox` key → always the sandbox rail (body cannot escalate to live).
 * - `live` key (or missing key_env — treated as live) → body rail, but
 *   sandbox rails are refused. Absence is never upgraded to sandbox.
 */
export function resolveMerchantRail(input: { keyEnv: KeyEnv | undefined; requestedRail: string; sandboxRailId?: string }): string {
  const sandboxRail = input.sandboxRailId ?? DEFAULT_SANDBOX_RAIL_ID;
  const env: KeyEnv = input.keyEnv === 'sandbox' ? 'sandbox' : 'live';

  if (!input.requestedRail || !input.requestedRail.trim()) {
    throw new PayError('railAdapter is required', 'pay.validation_failed');
  }
  const requested = input.requestedRail.trim();

  if (env === 'sandbox') {
    // Sandbox key: force the sandbox rail. Caller may name it or something
    // else; they do not get a live rail under a sandbox credential.
    return sandboxRail;
  }

  // Live key (or session without key_env): may not use a sandbox rail.
  if (isSandboxRailId(requested)) {
    throw new PayError(
      `Rail "${requested}" is a SANDBOX and a live API key may not use it. ` +
        `Mint a sandbox key (mode=sandbox) to exercise the sandbox rail, or name a live rail. ` +
        `NOTHING WAS ATTEMPTED.`,
      'pay.sandbox_rail_refused',
    );
  }

  return requested;
}
