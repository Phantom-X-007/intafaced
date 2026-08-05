/**
 * NOTIFICATION PREFERENCES — mute law (TRK-ops.notifications residual slice).
 *
 * Product open question from the TRK pack: can users silence critical?
 * Stage answer: **no**. Critical (margin / safety) always fans out when a
 * target exists; mute applies only to `info` and `action`.
 *
 * Digest cadence is residual. No Class X gateway work here.
 */

export type NotifySeverity = 'info' | 'action' | 'critical';
export type MuteableChannel = 'email' | 'push' | 'sms';

export interface ChannelMutePrefs {
  /** Channels the user has muted for non-critical traffic. */
  readonly muted: ReadonlySet<MuteableChannel>;
}

export const EMPTY_MUTE_PREFS: ChannelMutePrefs = { muted: new Set() };

/**
 * Pure: may we attempt out-of-app delivery given severity + prefs?
 * In-app is never muted by this law (inbox always lands).
 */
export function isChannelMuted(prefs: ChannelMutePrefs, channel: MuteableChannel, severity: NotifySeverity): boolean {
  if (severity === 'critical') return false;
  return prefs.muted.has(channel);
}

export type MuteUpdateErrorCode = 'preference.critical_cannot_mute' | 'preference.invalid_channel';

export class MuteUpdateError extends Error {
  constructor(
    message: string,
    readonly code: MuteUpdateErrorCode,
  ) {
    super(message);
    this.name = 'MuteUpdateError';
  }
}

/**
 * L3 — how many muteable channels are muted (0–3). Never invents a mute.
 */
export function countMutedChannels(prefs: ChannelMutePrefs): number {
  return prefs.muted.size;
}

/**
 * L3 — sorted muteable channels currently muted. Empty prefs → [] (no invent).
 */
export function listMutedChannels(prefs: ChannelMutePrefs): readonly MuteableChannel[] {
  return (['email', 'push', 'sms'] as const).filter((c) => prefs.muted.has(c));
}

/** L3 — true when all three muteable channels are muted. Empty → false. */
export function allMuteableMuted(prefs: ChannelMutePrefs): boolean {
  return listMutedChannels(prefs).length === 3;
}

/** L3 — true when at least one muteable channel is muted. Empty → false. */
export function hasAnyMute(prefs: ChannelMutePrefs): boolean {
  return prefs.muted.size > 0;
}

/** L3 — true when no muteable channel is muted. Empty prefs → true. */
export function isFullyUnmuted(prefs: ChannelMutePrefs): boolean {
  return prefs.muted.size === 0;
}

/** Apply a mute toggle. Refuses any API that claims to mute "critical" as a channel. */
export function applyMuteToggle(current: ChannelMutePrefs, input: { channel: string; muted: boolean }): ChannelMutePrefs {
  const ch = input.channel;
  if (ch !== 'email' && ch !== 'push' && ch !== 'sms') {
    throw new MuteUpdateError(`Channel ${ch} is not muteable`, 'preference.invalid_channel');
  }
  const next = new Set(current.muted);
  if (input.muted) next.add(ch);
  else next.delete(ch);
  return { muted: next };
}

/** In-memory prefs for tests / Stage-1 process store. */
export class MemoryMuteStore {
  private readonly byUser = new Map<string, Set<MuteableChannel>>();

  get(userId: string): ChannelMutePrefs {
    const s = this.byUser.get(userId);
    return { muted: new Set(s ?? []) };
  }

  setMuted(userId: string, channel: MuteableChannel, muted: boolean): ChannelMutePrefs {
    const cur = this.get(userId);
    const next = applyMuteToggle(cur, { channel, muted });
    this.byUser.set(userId, new Set(next.muted));
    return next;
  }

  /**
   * L3 — whether channel is muted for user. Missing prefs → false (never invent mute).
   */
  isMuted(userId: string, channel: MuteableChannel): boolean {
    return this.get(userId).muted.has(channel);
  }

  /**
   * L3 — muted channel count for user. Missing → 0.
   */
  muteCount(userId: string): number {
    return this.get(userId).muted.size;
  }
}
