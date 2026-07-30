import 'server-only';
import type { ModuleId } from '@intafaced/config';

/**
 * THE WIRE FROM THIS CONSOLE TO THE PLATFORM (§14.6).
 *
 * Until this file existed, this app's own README said it plainly: "Flag
 * overrides staged on `/` are held in the browser session only", and the board
 * printed "Staged changes are held in this browser session and have not been
 * sent anywhere." `src/lib/operator-commands.ts` was blunter still about the
 * ledger controls: "They do NOT call them." §14.6 asks for a kill-switch an
 * operator can reach, and nothing here reached anything.
 *
 * It was not only this app. `svc-protocol` and `svc-indexer` each export a
 * `set…Enabled(next)` function commented "the kill-switch surface `apps/admin`
 * reaches" — module-scope functions in a service entry point, callable from no
 * other process. `svc-trade`, `svc-ws`, `svc-protocol` and `svc-token` read
 * their switch from an environment variable once, at boot. And `svc-ledger`
 * built the whole thing correctly — a durable `posting_freeze` row, an actor
 * column, a check constraint, `admin:treasury` on the procedures — then never
 * mounted the router that exposed them, so the platform's emergency stop was
 * reachable only by redeploying with `LEDGER_POSTING_ENABLED=false`, which per
 * `service.ts` "can freeze, and can never thaw".
 *
 * The honest summary of the state before this change: every kill-switch in the
 * platform required a redeploy, and the one surface that was supposed to reach
 * them reached nothing.
 *
 * ── The credential ──────────────────────────────────────────────────────────
 *
 * `ADMIN_OPERATOR_TOKEN` — an access token held server-side and never sent to
 * the browser. `ADMIN_TREASURY_TOKEN` is separate and optional, because halting
 * one market and halting all value movement are different authorities:
 * `admin:write` reaches the module switches, `admin:treasury` reaches the
 * ledger freeze, and a console configured with only the first cannot stop the
 * money plane. `svc-edge` enforces that split independently — this is not the
 * place it is decided, only the place it is respected.
 *
 * That the token identifies the CONSOLE rather than the human at it is a real
 * limitation, stated rather than hidden: this app has no login of its own (its
 * README has said so from the start), so the edge's audit line names one
 * operator identity per deployment. When operator SSO lands — the same §13
 * socket the README already names — these functions carry the signed-in
 * operator's own token and the audit line names the person.
 *
 * What it must not become in the meantime is a static shared secret with no
 * subject at all, which is why the token goes through the same
 * `verifyAccessToken` + `requireScope` path as every other caller.
 */

export interface AuditEntry {
  readonly at: string;
  readonly module: string;
  readonly actor: string;
  readonly reason: string;
  readonly previous: boolean;
  readonly next: boolean;
  readonly changed: boolean;
}

export interface KillSwitchSnapshot {
  readonly disabledModules: readonly ModuleId[];
  readonly reasons: Readonly<Record<string, string>>;
  /** Who halted what, when, and what it was before. Newest first. */
  readonly audit: readonly AuditEntry[];
}

export type ControlPlaneStatus =
  /** Configured and answering. */
  | 'reachable'
  /** No token / no `EDGE_URL` — the console must not pretend. */
  | 'unconfigured'
  /** Configured, and the edge did not answer or refused us. */
  | 'unreachable';

export interface ControlPlaneState {
  readonly status: ControlPlaneStatus;
  readonly snapshot: KillSwitchSnapshot;
  /** One sentence an operator can act on. Null when everything is fine. */
  readonly detail: string | null;
}

const EMPTY: KillSwitchSnapshot = { disabledModules: [], reasons: {}, audit: [] };

/** How long the console waits before reporting the control plane as unreachable. */
const TIMEOUT_MS = 5_000;

function config(tokenVar: 'ADMIN_OPERATOR_TOKEN' | 'ADMIN_TREASURY_TOKEN'): { edgeUrl: string; token: string } | null {
  const edgeUrl = process.env.EDGE_URL;
  const token = process.env[tokenVar];
  if (!edgeUrl || !token) return null;
  return { edgeUrl: edgeUrl.replace(/\/$/, ''), token };
}

export async function readKillSwitches(): Promise<ControlPlaneState> {
  const cfg = config('ADMIN_OPERATOR_TOKEN');
  if (!cfg) {
    return {
      status: 'unconfigured',
      snapshot: EMPTY,
      detail: 'Set EDGE_URL and ADMIN_OPERATOR_TOKEN on this app to reach the platform control plane.',
    };
  }

  try {
    const res = await fetch(`${cfg.edgeUrl}/admin/kill-switches`, {
      headers: { authorization: `Bearer ${cfg.token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return { status: 'unreachable', snapshot: EMPTY, detail: `svc-edge answered ${res.status} — check ADMIN_OPERATOR_TOKEN.` };
    }

    const body = (await res.json()) as Partial<KillSwitchSnapshot>;
    return {
      status: 'reachable',
      snapshot: { disabledModules: body.disabledModules ?? [], reasons: body.reasons ?? {}, audit: body.audit ?? [] },
      detail: null,
    };
  } catch (err) {
    return { status: 'unreachable', snapshot: EMPTY, detail: `svc-edge did not answer: ${(err as Error).message}` };
  }
}

export interface ToggleInput {
  readonly module: ModuleId;
  readonly disabled: boolean;
  /** The edge requires ≥ 12 characters. A switch with no recorded reason is an outage nobody can explain. */
  readonly reason: string;
}

export interface ToggleResult {
  readonly ok: boolean;
  readonly status: number;
  readonly snapshot: KillSwitchSnapshot;
  readonly detail: string | null;
}

export async function setKillSwitch(input: ToggleInput): Promise<ToggleResult> {
  const cfg = config('ADMIN_OPERATOR_TOKEN');
  if (!cfg) {
    return { ok: false, status: 503, snapshot: EMPTY, detail: 'This console is not configured to reach the control plane.' };
  }

  try {
    const res = await fetch(`${cfg.edgeUrl}/admin/kill-switches`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await res.json().catch(() => ({}))) as Partial<KillSwitchSnapshot> & { error?: string };
    if (!res.ok) return { ok: false, status: res.status, snapshot: EMPTY, detail: body.error ?? `svc-edge answered ${res.status}` };

    return {
      ok: true,
      status: res.status,
      snapshot: { disabledModules: body.disabledModules ?? [], reasons: body.reasons ?? {}, audit: body.audit ?? [] },
      detail: null,
    };
  } catch (err) {
    return { ok: false, status: 502, snapshot: EMPTY, detail: `svc-edge did not answer: ${(err as Error).message}` };
  }
}

// ── The money plane ─────────────────────────────────────────────────────────

export interface FreezeState {
  readonly frozen: boolean;
  readonly reason: string | null;
  /** Who last moved it. Written by svc-ledger from its own token verification. */
  readonly actor: string | null;
  readonly changedAt: string | null;
}

export interface FreezeResult {
  readonly ok: boolean;
  readonly status: number;
  readonly state: FreezeState | null;
  readonly detail: string | null;
}

const UNCONFIGURED_TREASURY =
  'Set EDGE_URL and ADMIN_TREASURY_TOKEN to reach the ledger freeze. This is a separate credential from ADMIN_OPERATOR_TOKEN on purpose.';

export async function readFreeze(): Promise<FreezeResult> {
  const cfg = config('ADMIN_TREASURY_TOKEN');
  if (!cfg) return { ok: false, status: 503, state: null, detail: UNCONFIGURED_TREASURY };

  try {
    const res = await fetch(`${cfg.edgeUrl}/admin/ledger/freeze`, {
      headers: { authorization: `Bearer ${cfg.token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<FreezeState> & { error?: string; message?: string };
    if (!res.ok)
      return { ok: false, status: res.status, state: null, detail: body.error ?? body.message ?? `svc-edge answered ${res.status}` };

    return {
      ok: true,
      status: res.status,
      state: { frozen: body.frozen ?? false, reason: body.reason ?? null, actor: body.actor ?? null, changedAt: body.changedAt ?? null },
      detail: null,
    };
  } catch (err) {
    return { ok: false, status: 502, state: null, detail: `svc-edge did not answer: ${(err as Error).message}` };
  }
}

/**
 * Freeze or thaw ledger posting.
 *
 * A failure is never reported as a success. An operator who is told the platform
 * is halted when it is not is worse off than one who is told nothing — they walk
 * away from a book that is still accepting writes.
 */
export async function setFreeze(frozen: boolean, reason?: string): Promise<FreezeResult> {
  const cfg = config('ADMIN_TREASURY_TOKEN');
  if (!cfg) return { ok: false, status: 503, state: null, detail: UNCONFIGURED_TREASURY };

  try {
    const res = await fetch(`${cfg.edgeUrl}/admin/ledger/${frozen ? 'freeze' : 'unfreeze'}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      // A thaw carries no reason — svc-ledger clears the column, because "why it
      // is frozen" is meaningless once it is not.
      body: JSON.stringify(frozen ? { reason } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as Partial<FreezeState> & { error?: string; message?: string };
    if (!res.ok)
      return { ok: false, status: res.status, state: null, detail: body.error ?? body.message ?? `svc-edge answered ${res.status}` };

    return {
      ok: true,
      status: res.status,
      state: { frozen: body.frozen ?? frozen, reason: body.reason ?? null, actor: body.actor ?? null, changedAt: body.changedAt ?? null },
      detail: null,
    };
  } catch (err) {
    return { ok: false, status: 502, state: null, detail: `svc-edge did not answer: ${(err as Error).message}` };
  }
}
