/**
 * NETWORK SIGNAL HONESTY — VPN / Tor / proxy path (TRK-ops.compliance Stage 3).
 *
 * Title residual: "VPN/Tor detection if titled is either real signal or explicit
 * residual — no fake certainty."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * Sanctions screening already refuses to let "nobody supplied a list" look like
 * "we checked and you are clean". Network-path detection had no equivalent: an
 * unset partner and a partner that returned clear were the same missing field,
 * so every call site could invent a green tick by omission.
 *
 * This file makes the states different things:
 *
 *   `unset`   → NO partner is wired. Not "clear", *unknown*.
 *   `clear`   → a partner was consulted and returned not-VPN / not-Tor.
 *   `flagged` → a partner was consulted and returned VPN/Tor/proxy signal.
 *   `dark`    → a partner is claimed configured, but no signal arrived
 *               (timeout, error, empty body). Fail-closed when required.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE DELIBERATELY DOES NOT CONTAIN
 *
 * A screening partner name, API key, or proprietary list. Those are Class X
 * (procurement + counsel). Naming a vendor here would fail brand-scan and
 * invent a product dependency the repo has not purchased. The MECHANISM is
 * engineering; the PARTNER is an operator decision with secrets outside git.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ENV SHAPE
 *
 *   INTAFACED_NETWORK_SIGNAL_CONFIGURED
 *     Unset / blank / not `1`/`true` → partner absent (`unset` path).
 *     `1` or `true`                  → partner slot is claimed configured.
 *     Never invents a clear signal by itself — only the request-time payload
 *     can produce `clear` / `flagged` / `dark`.
 *
 *   INTAFACED_NETWORK_SIGNAL_FAIL_CLOSED
 *     When true (or `1`), an `unset` or `dark` signal refuses the access path
 *     rather than silently allowing. Default off so local/dev is not blocked
 *     until a partner is procured (Class X). Staging/prod operators turn this
 *     on when they mean enforcement.
 */

/** Env: partner slot claimed configured (not a vendor name). */
export const NETWORK_SIGNAL_CONFIGURED_ENV = 'INTAFACED_NETWORK_SIGNAL_CONFIGURED';

/** Env: refuse when signal is unset or dark. */
export const NETWORK_SIGNAL_FAIL_CLOSED_ENV = 'INTAFACED_NETWORK_SIGNAL_FAIL_CLOSED';

/**
 * What the network-signal authority has said, if anything.
 *
 * `unset` and `clear` both leave the caller on the path and are NOT the same
 * thing. Conflating them is how "we never bought a partner" gets read as
 * "this request is clean of VPN/Tor".
 */
export type NetworkSignalDeclaration =
  /** Nobody wired a partner. The fail-closed guard refuses on this when armed. */
  | 'unset'
  /** Partner consulted; path not flagged. */
  | 'clear'
  /** Partner consulted; VPN/Tor/proxy signal present. */
  | 'flagged'
  /** Partner claimed configured but signal missing or errored. */
  | 'dark';

export type NetworkSignalKind = 'none' | 'vpn' | 'tor' | 'proxy' | 'unknown';

export interface NetworkSignalStatus {
  readonly declaration: NetworkSignalDeclaration;
  /**
   * Was a partner slot claimed at all?
   *
   * `false` means nothing was consulted — NOT that the caller is clear.
   * Never render this as a green tick.
   */
  readonly partnerConfigured: boolean;
  /** Present only when declaration is `flagged`. */
  readonly kind: NetworkSignalKind;
  /** Provenance for logs — env claim or request-time probe id, never a brand. */
  readonly source: string;
  /** One sentence an operator can act on. */
  readonly summary: string;
}

export type NetworkAccessCode =
  | 'allowed.network'
  | 'denied.network_flagged'
  | 'denied.network_unconfigured'
  | 'denied.network_dark';

export type NetworkAccessDecision = {
  readonly allowed: boolean;
  readonly code: NetworkAccessCode;
  readonly signal: NetworkSignalStatus;
  readonly reason: string;
};

/** Request-time observation from whatever adapter the edge wires (Class X). */
export type NetworkSignalObservation = {
  /**
   * Partner returned a result.
   *   · `clear`   — not VPN/Tor
   *   · `flagged` — VPN/Tor/proxy
   *   · `error`   — timeout / 5xx / unparseable → `dark`
   * Omit when no probe ran.
   */
  readonly result?: 'clear' | 'flagged' | 'error';
  readonly kind?: NetworkSignalKind;
  /** Free-text probe id / request id — not a vendor product name. */
  readonly source?: string;
};

function truthyEnv(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Is the partner slot claimed configured from env?
 *
 * Claiming configured does NOT invent a clear signal. It only opens the path
 * for request-time observations to become `clear` / `flagged` / `dark`.
 */
export function networkPartnerConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return truthyEnv(env[NETWORK_SIGNAL_CONFIGURED_ENV]);
}

/** Fail-closed when unset or dark. Default false (local frictionless). */
export function networkSignalFailClosed(env: Record<string, string | undefined> = process.env): boolean {
  return truthyEnv(env[NETWORK_SIGNAL_FAIL_CLOSED_ENV]);
}

/**
 * Resolve the honest status from env claim + request-time observation.
 *
 * Rules (fail closed on the honesty axis):
 *   1. Partner not configured → `unset` regardless of observation
 *      (a forged "clear" without a partner must not look real).
 *   2. Partner configured, no observation → `dark` (not clear).
 *   3. Partner configured, observation error → `dark`.
 *   4. Partner configured, clear / flagged → that declaration.
 */
export function resolveNetworkSignal(
  env: Record<string, string | undefined> = process.env,
  observation?: NetworkSignalObservation | null,
): NetworkSignalStatus {
  const partnerConfigured = networkPartnerConfigured(env);

  if (!partnerConfigured) {
    return {
      declaration: 'unset',
      partnerConfigured: false,
      kind: 'none',
      source: 'unconfigured',
      summary:
        'network signal: NOT CONFIGURED — no VPN/Tor partner is wired. ' +
        'This is not "the path is clear"; nothing was consulted. ' +
        `Set ${NETWORK_SIGNAL_CONFIGURED_ENV}=1 only after a partner is procured (Class X).`,
    };
  }

  const source = observation?.source?.trim() || `env:${NETWORK_SIGNAL_CONFIGURED_ENV}`;

  if (!observation || observation.result === undefined) {
    return {
      declaration: 'dark',
      partnerConfigured: true,
      kind: 'unknown',
      source,
      summary:
        'network signal: DARK — partner slot is configured but no signal arrived. ' +
        'Not "clear". Fail-closed refuses this when armed.',
    };
  }

  if (observation.result === 'error') {
    return {
      declaration: 'dark',
      partnerConfigured: true,
      kind: 'unknown',
      source,
      summary: `network signal: DARK — partner probe failed (${source}). Not "clear".`,
    };
  }

  if (observation.result === 'flagged') {
    const kind = observation.kind && observation.kind !== 'none' ? observation.kind : 'unknown';
    return {
      declaration: 'flagged',
      partnerConfigured: true,
      kind,
      source,
      summary: `network signal: FLAGGED (${kind}) from ${source}.`,
    };
  }

  // clear
  return {
    declaration: 'clear',
    partnerConfigured: true,
    kind: 'none',
    source,
    summary: `network signal: CLEAR from ${source} — partner consulted, not flagged.`,
  };
}

/**
 * Access decision for a network-path check.
 *
 * Fail-closed (when armed) refuses `unset` and `dark`. Flagged always refuses.
 * Clear allows. Unset without fail-closed allows but the status still says unset
 * so dashboards cannot paint a green tick from omission alone.
 */
export function checkNetworkAccess(
  env: Record<string, string | undefined> = process.env,
  observation?: NetworkSignalObservation | null,
): NetworkAccessDecision {
  const signal = resolveNetworkSignal(env, observation);
  const failClosed = networkSignalFailClosed(env);

  if (signal.declaration === 'flagged') {
    return {
      allowed: false,
      code: 'denied.network_flagged',
      signal,
      reason: signal.summary,
    };
  }

  if (signal.declaration === 'unset' && failClosed) {
    return {
      allowed: false,
      code: 'denied.network_unconfigured',
      signal,
      reason:
        'network signal fail-closed: partner not configured — refusing rather than inventing a clear path.',
    };
  }

  if (signal.declaration === 'dark' && failClosed) {
    return {
      allowed: false,
      code: 'denied.network_dark',
      signal,
      reason: 'network signal fail-closed: partner dark — refusing rather than inventing a clear path.',
    };
  }

  return {
    allowed: true,
    code: 'allowed.network',
    signal,
    reason: signal.summary,
  };
}

/**
 * Staging/prod posture helper: partner must be claimed OR fail-closed must not
 * be armed with a silent allow. Returns issues for boot logs — does not throw
 * on unset alone (Class X partner is human-procured). Throws only when the
 * config is self-contradictory (fail-closed off is fine; fail-closed on with
 * forged clear observation without partner is already impossible by resolve).
 */
export function networkSignalStatusLine(
  env: Record<string, string | undefined> = process.env,
  observation?: NetworkSignalObservation | null,
): string {
  const s = resolveNetworkSignal(env, observation);
  const fc = networkSignalFailClosed(env) ? 1 : 0;
  return `network_signal=${s.declaration} partner=${s.partnerConfigured ? 1 : 0} fail_closed=${fc} kind=${s.kind}`;
}
