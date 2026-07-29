import { z } from 'zod';
import { AuthError, bearerToken, requireMfa, requireScope, verifyAccessToken, type Principal, type TokenConfig } from '@intafaced/auth';
import { MODULE_IDS, isModuleId } from '@intafaced/config';
import type { KillSwitchState } from './kill-switch.js';

/**
 * THE OPERATOR CONTROL SURFACE (§14.6) — what `apps/admin` reaches.
 *
 * Mounted at `/admin/*`, deliberately OUTSIDE `/api/*`: nothing here is
 * proxied, and the catch-all proxy must never be the thing that decides whether
 * an admin path is real. `resolve()` returns null for `/admin/...` and an
 * unlisted prefix is a 404, so these routes have to be registered explicitly —
 * which is the property that keeps `/admin` from ever becoming a pass-through.
 *
 * ── Authentication: the platform's own tokens, not a shared operator key ────
 *
 * The obvious shortcut is a static `ADMIN_CONTROL_SECRET` header. It was
 * rejected: a static secret has no subject, so the audit line for the most
 * consequential action in the platform would read "somebody with the key", and
 * rotating it means restarting the edge — during an incident, which is when the
 * key is most likely to have been in a screenshot.
 *
 * The edge already holds `JWT_ACCESS_SECRET`, because verifying user tokens is
 * its entire job. So an operator presents the same kind of token every other
 * caller presents, and it is checked with the same guards every service uses:
 *
 *   · `admin:write` — the operator scope. No user session carries it;
 *     `defaultScopes()` in svc-identity does not list it and there is no path
 *     that adds it.
 *   · `requireMfa` — locally, exactly as `kyc.approve` does it and for the same
 *     stated reason: `admin:write` is not in `INTERACTIVE_ONLY_SCOPES` (whose
 *     membership test is "does this move value OFF the platform"), but a switch
 *     that can stop the exchange is a privilege whose leak must cost a second
 *     factor. Arguing the shared list should grow belongs in its own PR (§15.2).
 *
 * The token names a user, so every flip is attributable.
 */

const toggleSchema = z.object({
  module: z.string().refine(isModuleId, { message: `module must be one of: ${MODULE_IDS.join(', ')}` }),
  disabled: z.boolean(),
  /**
   * Required, and required to be useful.
   *
   * `apps/admin` already makes the operator type a reason before a ledger
   * freeze, on the argument that friction should be proportional to blast
   * radius. The same argument applies here and the check belongs on the server
   * as well as in the console — a control plane that trusts the UI to have
   * asked is a control plane with no record of why the platform went down.
   */
  reason: z.string().min(12).max(500),
});

export interface AdminApi {
  /** Verify an Authorization header, or throw `AuthError`. */
  authenticate(header: string | undefined): Promise<Principal>;
  /** Current state, as the console renders it. */
  read(): { disabledModules: string[]; reasons: Record<string, string> };
  /** Apply one toggle. Returns the new state. */
  apply(body: unknown, operator: Principal): { disabledModules: string[]; reasons: Record<string, string>; changed: boolean };
}

export function createAdminApi(state: KillSwitchState, tokens: TokenConfig): AdminApi {
  const snapshot = () => {
    const disabled = state.disabledModules();
    const reasons: Record<string, string> = {};
    for (const m of disabled) reasons[m] = state.reasonFor(m) ?? '';
    return { disabledModules: disabled as string[], reasons };
  };

  return {
    async authenticate(header) {
      const token = bearerToken(header ?? null);
      if (!token) throw new AuthError('An operator token is required', 'token.invalid');

      const principal = await verifyAccessToken(token, tokens);
      // Order matters only for the message the operator sees; both throw.
      requireScope(principal, 'admin:write');
      requireMfa(principal);
      return principal;
    },

    read: snapshot,

    apply(body, operator) {
      const input = toggleSchema.parse(body);
      const before = state.isKilled(input.module);
      state.set(input.module, input.disabled, `${input.reason} (by ${operator.userId})`);
      return { ...snapshot(), changed: before !== input.disabled };
    },
  };
}

/** Map an `AuthError` to the status an operator console can branch on. */
export function statusForAuthError(err: AuthError): number {
  switch (err.code) {
    case 'token.expired':
    case 'token.invalid':
    case 'token.malformed':
      return 401;
    case 'mfa.required':
      return 401;
    case 'scope.denied':
      return 403;
    default:
      return 401;
  }
}
