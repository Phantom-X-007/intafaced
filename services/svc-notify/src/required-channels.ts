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
