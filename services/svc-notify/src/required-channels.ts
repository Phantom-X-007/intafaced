/**
 * Notify L3 — required out-of-app channel declaration honesty.
 *
 * Staging/prod must declare required channels or explicit "none".
 * Missing credentials for a required channel is a refuse, not silent success.
 * Never logs recipient addresses.
 */

export type OutOfAppChannel = 'email' | 'push' | 'sms';

export type RequiredChannelsConfig = { readonly mode: 'none' } | { readonly mode: 'list'; readonly channels: readonly OutOfAppChannel[] };

export type RequiredChannelsParse =
  { readonly ok: true; readonly config: RequiredChannelsConfig } | { readonly ok: false; readonly reason: string };

export function parseRequiredChannels(raw: string | undefined, appEnv: string): RequiredChannelsParse {
  const env = (appEnv || 'dev').toLowerCase();
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) {
    if (env === 'production' || env === 'prod' || env === 'staging') {
      return {
        ok: false,
        reason: 'NOTIFY_REQUIRED_CHANNELS must be set in staging/prod (use "none" if intentional)',
      };
    }
    return { ok: true, config: { mode: 'none' } };
  }
  if (v === 'none') return { ok: true, config: { mode: 'none' } };
  const parts = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed: OutOfAppChannel[] = [];
  for (const p of parts) {
    if (p !== 'email' && p !== 'push' && p !== 'sms') {
      return { ok: false, reason: `unknown required channel "${p}"` };
    }
    if (!allowed.includes(p)) allowed.push(p);
  }
  if (allowed.length === 0) return { ok: false, reason: 'empty channel list' };
  return { ok: true, config: { mode: 'list', channels: allowed } };
}

export type CredentialPresence = Readonly<Record<OutOfAppChannel, boolean>>;

export function missingRequiredCredentials(config: RequiredChannelsConfig, present: CredentialPresence): readonly OutOfAppChannel[] {
  if (config.mode === 'none') return [];
  return config.channels.filter((c) => !present[c]);
}

/**
 * L3 — readiness for out-of-app fanout. Missing required creds → refuse,
 * never silent partial "success".
 */
export type FanoutReadiness =
  | { readonly ok: true; readonly config: RequiredChannelsConfig }
  | { readonly ok: false; readonly reason: string; readonly missing: readonly OutOfAppChannel[] };

export function fanoutReadiness(input: { requiredRaw: string | undefined; appEnv: string; present: CredentialPresence }): FanoutReadiness {
  const parsed = parseRequiredChannels(input.requiredRaw, input.appEnv);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, missing: [] };
  }
  const missing = missingRequiredCredentials(parsed.config, input.present);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `missing credentials for required channels: ${missing.join(',')}`,
      missing,
    };
  }
  return { ok: true, config: parsed.config };
}

/**
 * L3 — required channel count for operator honesty boards.
 * mode none → 0 (honest: no out-of-app requirement).
 */
export function requiredChannelCount(config: RequiredChannelsConfig): number {
  return config.mode === 'none' ? 0 : config.channels.length;
}

/** L3 — all out-of-app channels stable order. */
export function allOutOfAppChannels(): readonly OutOfAppChannel[] {
  return ['email', 'push', 'sms'];
}

/** L3 — true when config mode is none. */
export function isRequiredChannelsNone(config: RequiredChannelsConfig): boolean {
  return config.mode === 'none';
}

/** L3 — true when config mode is list. */
export function isRequiredChannelsList(config: RequiredChannelsConfig): boolean {
  return config.mode === 'list';
}

/** L3 — channels present as true. Empty → []. */
export function presentOutOfAppChannels(present: CredentialPresence): readonly OutOfAppChannel[] {
  return allOutOfAppChannels().filter((c) => present[c] === true);
}

/** L3 — channels missing credentials (false). Empty → []. */
export function absentOutOfAppChannels(present: CredentialPresence): readonly OutOfAppChannel[] {
  return allOutOfAppChannels().filter((c) => present[c] !== true);
}

/** L3 — readiness board card. */
export function fanoutReadinessBoardCard(input: { requiredRaw: string | undefined; appEnv: string; present: CredentialPresence }): {
  readonly ready: boolean;
  readonly missing: readonly OutOfAppChannel[];
  readonly missingCount: number;
  readonly presentCount: number;
} {
  const r = fanoutReadiness(input);
  const presentCount = presentOutOfAppChannels(input.present).length;
  if (r.ok) {
    return { ready: true, missing: [], missingCount: 0, presentCount };
  }
  return {
    ready: false,
    missing: r.missing,
    missingCount: r.missing.length,
    presentCount,
  };
}

/** L3 — export lines channel,present(0|1). */
export function credentialPresenceExportLines(present: CredentialPresence): readonly string[] {
  return allOutOfAppChannels().map((c) => `${c},${present[c] ? '1' : '0'}`);
}

/** L3 — credential presence export header. */
export function credentialPresenceExportHeader(): string {
  return 'channel,present';
}
