import { z } from 'zod';
import { AuthError, bearerToken, requireMfa, requireScope, verifyAccessToken, type Principal, type TokenConfig } from '@intafaced/auth';
import { MODULE_IDS, isModuleId, type ModuleId } from '@intafaced/config';
import type { KillSwitchAuditEntry, KillSwitchState } from './kill-switch.js';

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
 * caller presents, and it is checked with the same guards every service uses.
 *
 * ── Two scopes, because there are two different authorities here ────────────
 *
 *   · `admin:write` — halt a module. No user session carries it;
 *     `defaultScopes()` in svc-identity does not list it, `SESSION_SCOPES`
 *     excludes every `admin:*` scope, and `assertDelegatableScopes` refuses to
 *     mint an API key with one.
 *
 *     `requireMfa` is applied locally, exactly as `kyc.approve` does it and for
 *     the same stated reason: `admin:write` is not in `INTERACTIVE_ONLY_SCOPES`
 *     (whose membership test is "does this move value OFF the platform"), but a
 *     switch that can stop the exchange is a privilege whose leak must cost a
 *     second factor. Arguing the shared list should grow belongs in its own PR
 *     (§15.2).
 *
 *   · `admin:treasury` — the ledger freeze, and anything else that touches the
 *     money plane. Already in `INTERACTIVE_ONLY_SCOPES`, so `requireScope`
 *     enforces MFA by itself and no local check is needed.
 *
 * Halting one market and halting all value movement platform-wide are not the
 * same authority and must not share a credential. An operator on the trading
 * desk needs the first; the second is the switch `flags.ts` calls "the most
 * consequential in the platform", and `svc-ledger` gates it on `admin:treasury`
 * on its own side too. Checking it here as well is not redundancy for its own
 * sake — it means the edge refuses before it forwards a token, so an
 * under-scoped operator never reaches the money plane at all.
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

const freezeSchema = z.object({ reason: z.string().min(12).max(500) });

export interface KillSwitchSnapshot {
  readonly disabledModules: readonly ModuleId[];
  readonly reasons: Readonly<Record<string, string>>;
  /** Who halted what, when, and what the state was before. Newest first. */
  readonly audit: readonly KillSwitchAuditEntry[];
}

export interface FreezeSnapshot {
  readonly frozen: boolean;
  readonly reason: string | null;
  readonly actor: string | null;
  readonly changedAt: string;
}

/**
 * How the edge reaches svc-ledger's operator surface.
 *
 * A function rather than a URL so the transport is injectable in a test without
 * a live ledger, and so this file states exactly what it needs: forward one
 * operator's own bearer token to one named path. It is not a proxy and cannot
 * become one.
 */
export type LedgerOperatorCall = (
  path: '/operator/freeze' | '/operator/unfreeze',
  method: 'GET' | 'POST',
  bearer: string,
  body?: unknown,
) => Promise<{ status: number; body: unknown }>;

export interface AdminApi {
  /** Verify an Authorization header for module control, or throw `AuthError`. */
  authenticate(header: string | undefined): Promise<Principal>;
  /** Verify an Authorization header for treasury control, or throw `AuthError`. */
  authenticateTreasury(header: string | undefined): Promise<Principal>;
  /** Current kill-switch state and its audit trail, as the console renders it. */
  read(): KillSwitchSnapshot;
  /** Apply one module toggle. Returns the new state. */
  apply(body: unknown, operator: Principal): KillSwitchSnapshot & { changed: boolean };
  /** Read the ledger's durable freeze row through svc-ledger. */
  readFreeze(header: string): Promise<{ status: number; body: unknown }>;
  /** Freeze or thaw the ledger. Attribution and durability are svc-ledger's. */
  setFreeze(frozen: boolean, body: unknown, header: string): Promise<{ status: number; body: unknown }>;
}

export interface AdminApiDeps {
  readonly tokens: TokenConfig;
  /**
   * Absent when the deployment has no `LEDGER_URL`.
   *
   * Null rather than a stub that returns success. A console that cannot reach
   * the money plane must be told so; the failure mode of pretending is an
   * operator who believes the platform is halted when it is not.
   */
  readonly ledger: LedgerOperatorCall | null;
}

export function createAdminApi(state: KillSwitchState, deps: AdminApiDeps): AdminApi {
  const snapshot = (): KillSwitchSnapshot => {
    const disabled = state.disabledModules();
    const reasons: Record<string, string> = {};
    for (const m of disabled) reasons[m] = state.reasonFor(m) ?? '';
    return { disabledModules: disabled, reasons, audit: state.auditTrail() };
  };

  const verify = async (header: string | undefined): Promise<Principal> => {
    const token = bearerToken(header ?? null);
    if (!token) throw new AuthError('An operator token is required', 'token.invalid');
    return verifyAccessToken(token, deps.tokens);
  };

  const unreachable = { status: 503, body: { error: 'This edge is not configured to reach svc-ledger', code: 'edge.ledger_unreachable' } };

  return {
    async authenticate(header) {
      const principal = await verify(header);
      // Order matters only for the message the operator sees; both throw.
      requireScope(principal, 'admin:write');
      requireMfa(principal);
      return principal;
    },

    async authenticateTreasury(header) {
      const principal = await verify(header);
      // `admin:treasury` is interactive-only, so this enforces MFA too.
      requireScope(principal, 'admin:treasury');
      return principal;
    },

    read: snapshot,

    apply(body, operator) {
      const input = toggleSchema.parse(body);
      const before = state.isKilled(input.module as ModuleId);

      /**
       * The audit entry is written by `state.set` before the booleans move, and
       * if that throws nothing is switched — the request fails and the platform
       * stays in the state the last recorded action left it in. A halt with no
       * record of who called it is an incident with no timeline, so the record
       * is not a side effect of the flip; the flip is a consequence of the
       * record landing.
       */
      state.set(input.module as ModuleId, input.disabled, operator.userId, input.reason);

      return { ...snapshot(), changed: before !== input.disabled };
    },

    async readFreeze(header) {
      if (!deps.ledger) return unreachable;
      return deps.ledger('/operator/freeze', 'GET', header);
    },

    async setFreeze(frozen, body, header) {
      if (!deps.ledger) return unreachable;
      // A thaw carries no reason — svc-ledger clears it, because "why it is
      // frozen" is meaningless once it is not.
      const payload = frozen ? freezeSchema.parse(body) : undefined;
      return deps.ledger(frozen ? '/operator/freeze' : '/operator/unfreeze', 'POST', header, payload);
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

/**
 * The default `LedgerOperatorCall` — an HTTP call to one of two named paths.
 *
 * Forwards the OPERATOR's own bearer token rather than a service credential, so
 * `posting_freeze.actor` is written by svc-ledger from its own verification of
 * that token. The edge cannot cause a freeze attributed to anyone but the human
 * who presented the credential, which is the property that makes the ledger's
 * audit row trustworthy rather than merely present.
 */
export function httpLedgerOperator(baseUrl: string, timeoutMs: number): LedgerOperatorCall {
  const base = baseUrl.replace(/\/$/, '');

  return async (path, method, bearer, body) => {
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          authorization: bearer,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    } catch (err) {
      // 502, not 500: the edge is fine, the ledger did not answer, and an
      // operator must be able to tell those apart before deciding what to do
      // next. Never a success — an unconfirmed freeze reported as done is how
      // somebody walks away from a platform that is still moving money.
      return {
        status: 502,
        body: { error: `svc-ledger did not answer: ${(err as Error).message}`, code: 'edge.ledger_unavailable' },
      };
    }
  };
}
