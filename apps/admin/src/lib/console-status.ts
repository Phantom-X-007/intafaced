/**
 * WHAT CAN THIS CONSOLE ACTUALLY DO RIGHT NOW?
 *
 * ── The failure this exists to make impossible ──────────────────────────────
 *
 * `apps/admin` on :3100 returned 404 for `/api/kill-switch`, and the deployed
 * container held none of `EDGE_URL`, `ADMIN_OPERATOR_TOKEN` or
 * `ADMIN_TREASURY_TOKEN` — `docker-compose.apps.yml` set no such variables. An
 * operator opening the console during an incident saw a board of switches, one
 * of them labelled "halts ALL value movement platform-wide", and flipping one
 * changed a boolean in their browser tab.
 *
 * The code was not the problem. `control-plane-client.ts` had been correct since
 * #186 and already returned `unconfigured` rather than pretending. The problem
 * was that "unconfigured" was a value one panel on one page rendered, so it was
 * possible to be three clicks deep in a console that could not halt anything and
 * never see it — and that the answer to "why can't it?" ("set EDGE_URL and
 * ADMIN_OPERATOR_TOKEN") named two variables without saying which of them was
 * the one actually missing.
 *
 * So the capability is computed ONCE, from names alone, and stated everywhere.
 *
 * ── Never a value, only a name ──────────────────────────────────────────────
 *
 * Nothing here returns, logs or renders the CONTENT of a credential. The whole
 * output is booleans plus the NAMES of variables that are unset, which is what
 * an operator needs in order to fix it and what an attacker learns nothing from.
 * `EDGE_URL` is the one exception and is not a secret: it is a hostname on an
 * internal network, and an operator staring at "unreachable" needs to see which
 * address the console has been trying.
 *
 * ── Pure, and parameterised on the environment ──────────────────────────────
 *
 * No `server-only` import and no read of `process.env` at module scope, because
 * this is the function the tests drive. The env is an argument; the server
 * callers pass `process.env`. That is the only reason a test can assert on what
 * a half-configured console renders without setting global state.
 */

/**
 * The two authorities, which are deliberately not one credential.
 *
 * Halting one market stops new risk on that market. Halting the money plane
 * stops trade fills, payouts, escrow releases, card authorisations, staking and
 * settlement for every user at once. `svc-edge` requires `admin:write` for the
 * first and `admin:treasury` for the second and enforces the split on its own
 * side — this file respects that split, it does not decide it.
 */
export type Authority = 'module' | 'treasury';

export const TOKEN_VAR: Readonly<Record<Authority, 'ADMIN_OPERATOR_TOKEN' | 'ADMIN_TREASURY_TOKEN'>> = {
  module: 'ADMIN_OPERATOR_TOKEN',
  treasury: 'ADMIN_TREASURY_TOKEN',
};

/** What each authority reaches, in the words an operator would use. */
export const AUTHORITY_REACH: Readonly<Record<Authority, string>> = {
  module: 'halt a module (stop new commitments on one market)',
  treasury: 'freeze the ledger (stop ALL value movement platform-wide)',
};

export interface AuthorityStatus {
  readonly authority: Authority;
  readonly tokenVar: 'ADMIN_OPERATOR_TOKEN' | 'ADMIN_TREASURY_TOKEN';
  /** True only when BOTH an edge address and this authority's token are set. */
  readonly configured: boolean;
  /** Variable NAMES that are unset. Never a value. */
  readonly missing: readonly string[];
}

export interface ConsoleStatus {
  /** Trailing slash stripped. Null when unset. Not a secret — see the header. */
  readonly edgeUrl: string | null;
  readonly module: AuthorityStatus;
  readonly treasury: AuthorityStatus;
  /** Union of both authorities' missing names, in declaration order, deduped. */
  readonly missing: readonly string[];
  /** True when the console can halt at least one thing. */
  readonly canHaltAnything: boolean;
  /** True when the BFF routes are behind the shared-secret gate (§13 until SSO). */
  readonly bffGated: boolean;
}

/** An env value counts only if it is a non-empty string after trimming. */
function present(env: NodeJS.ProcessEnv, name: string): boolean {
  return (env[name] ?? '').trim().length > 0;
}

function authorityStatus(env: NodeJS.ProcessEnv, authority: Authority, edgeUrl: string | null): AuthorityStatus {
  const tokenVar = TOKEN_VAR[authority];
  const missing: string[] = [];
  if (!edgeUrl) missing.push('EDGE_URL');
  if (!present(env, tokenVar)) missing.push(tokenVar);
  return { authority, tokenVar, configured: missing.length === 0, missing };
}

export function readConsoleStatus(env: NodeJS.ProcessEnv = process.env): ConsoleStatus {
  const raw = (env.EDGE_URL ?? '').trim();
  const edgeUrl = raw.length > 0 ? raw.replace(/\/$/, '') : null;

  const moduleStatus = authorityStatus(env, 'module', edgeUrl);
  const treasuryStatus = authorityStatus(env, 'treasury', edgeUrl);

  return {
    edgeUrl,
    module: moduleStatus,
    treasury: treasuryStatus,
    missing: [...new Set([...moduleStatus.missing, ...treasuryStatus.missing])],
    canHaltAnything: moduleStatus.configured || treasuryStatus.configured,
    bffGated: present(env, 'ADMIN_BFF_SHARED_SECRET'),
  };
}

/**
 * One sentence an operator can act on, for the banner and for the `detail` field
 * of a control-plane read.
 *
 * Says what is lost, then names exactly what to set. "Set EDGE_URL and
 * ADMIN_OPERATOR_TOKEN" when only the token is missing sends somebody to check a
 * variable that was already correct.
 */
export function describeUnconfigured(status: AuthorityStatus): string {
  const names = status.missing.join(' and ');
  return `This console cannot ${AUTHORITY_REACH[status.authority]} — ${names} ${status.missing.length === 1 ? 'is' : 'are'} not set on this app.`;
}

/**
 * The `disabled` reason for a control, or null when the control may act.
 *
 * Every control that reaches the platform asks this and renders the answer NEXT
 * TO ITSELF. A control that cannot act must not look like one that can, and a
 * disabled attribute alone does not say why — an operator at 3am reads "greyed
 * out" as "broken console", not as "this deployment has no treasury token".
 */
export function haltBlockedReason(status: AuthorityStatus): string | null {
  return status.configured ? null : describeUnconfigured(status);
}
