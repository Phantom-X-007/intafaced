/**
 * NOTIFICATION PREFERENCES — mute law (TRK-ops.notifications residual).
 *
 * Product open question from the TRK pack: can users silence critical?
 * Stage answer: **no**. Critical (margin / safety) always fans out when a
 * target exists; mute applies only to `info` and `action`.
 *
 * Prefs are durable (`notify.channel_mutes` via PostgresMuteStore). Digest
 * cadence remains a separate residual and is not wired into dispatch.
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

/**
 * Who holds mute prefs.
 *
 * Production uses Postgres (`PostgresMuteStore`) so a restart cannot silently
 * unmute. Tests use `MemoryMuteStore`. Both are async so dispatch and the API
 * share one shape — a sync memory store would let prod drift into a second path.
 */
export interface MuteStore {
  get(userId: string): Promise<ChannelMutePrefs>;
  setMuted(userId: string, channel: MuteableChannel, muted: boolean): Promise<ChannelMutePrefs>;
}

/** In-memory prefs for unit tests (and harnesses that skip Postgres). */
export class MemoryMuteStore implements MuteStore {
  private readonly byUser = new Map<string, Set<MuteableChannel>>();

  async get(userId: string): Promise<ChannelMutePrefs> {
    const s = this.byUser.get(userId);
    return { muted: new Set(s ?? []) };
  }

  async setMuted(userId: string, channel: MuteableChannel, muted: boolean): Promise<ChannelMutePrefs> {
    const cur = await this.get(userId);
    const next = applyMuteToggle(cur, { channel, muted });
    this.byUser.set(userId, new Set(next.muted));
    return next;
  }

  /**
   * L3 — whether channel is muted for user. Missing prefs → false (never invent mute).
   */
  async isMuted(userId: string, channel: MuteableChannel): Promise<boolean> {
    return (await this.get(userId)).muted.has(channel);
  }

  /**
   * L3 — muted channel count for user. Missing → 0.
   */
  async muteCount(userId: string): Promise<number> {
    return (await this.get(userId)).muted.size;
  }
}

/** L3 — all muteable channel ids in stable order. */
export function allMuteableChannels(): readonly MuteableChannel[] {
  return ['email', 'push', 'sms'];
}

/** L3 — unmuted channels only. Empty mutes → all three. */
export function listUnmutedChannels(prefs: ChannelMutePrefs): readonly MuteableChannel[] {
  return allMuteableChannels().filter((c) => !prefs.muted.has(c));
}

/** L3 — muted/total as fixed 4dp. Always 3 muteable channels. */
export function mutedChannelRatio(prefs: ChannelMutePrefs): string {
  return (countMutedChannels(prefs) / allMuteableChannels().length).toFixed(4);
}

/** L3 — true when exactly one channel muted. */
export function hasSingleMute(prefs: ChannelMutePrefs): boolean {
  return countMutedChannels(prefs) === 1;
}

/** L3 — mute board card for operator UI. */
export function muteBoardCard(prefs: ChannelMutePrefs): {
  readonly mutedCount: number;
  readonly unmutedCount: number;
  readonly muted: readonly MuteableChannel[];
  readonly unmuted: readonly MuteableChannel[];
  readonly ratio: string;
  readonly single: boolean;
  readonly fullyMuted: boolean;
  readonly fullyUnmuted: boolean;
} {
  const muted = listMutedChannels(prefs);
  const unmuted = listUnmutedChannels(prefs);
  return {
    mutedCount: muted.length,
    unmutedCount: unmuted.length,
    muted,
    unmuted,
    ratio: mutedChannelRatio(prefs),
    single: hasSingleMute(prefs),
    fullyMuted: allMuteableMuted(prefs),
    fullyUnmuted: isFullyUnmuted(prefs),
  };
}

/** L3 — CSV export lines channel,muted(0|1). */
export function muteExportLines(prefs: ChannelMutePrefs): readonly string[] {
  return allMuteableChannels().map((c) => `${c},${prefs.muted.has(c) ? '1' : '0'}`);
}

/** L3 — mute export header. */
export function muteExportHeader(): string {
  return 'channel,muted';
}

/** L3 — full mute export text. */
export function muteExportText(prefs: ChannelMutePrefs): string {
  return [muteExportHeader(), ...muteExportLines(prefs)].join('\n');
}

/** L3 — parse mute export line. Invalid → null. */
export function parseMuteExportLine(line: string): { readonly channel: MuteableChannel; readonly muted: boolean } | null {
  const t = line.trim();
  if (!t || t === muteExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length !== 2) return null;
  const channel = parts[0]!.trim();
  const flag = parts[1]!.trim();
  if (channel !== 'email' && channel !== 'push' && channel !== 'sms') return null;
  if (flag !== '0' && flag !== '1') return null;
  return { channel, muted: flag === '1' };
}

/** L3 — data-line count in mute export text (excludes header). */
export function countMuteExportDataLines(text: string): number {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l !== muteExportHeader()).length;
}

/** L3 — true when text starts with mute export header. */
export function muteExportHasHeader(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? '';
  return first === muteExportHeader();
}

/** L3 — round-trip: line count = 1 header + data lines from export text. */
export function muteExportRoundTripOk(prefs: ChannelMutePrefs): boolean {
  return muteExportText(prefs).split('\n').filter(Boolean).length === 1 + countMuteExportDataLines(muteExportText(prefs));
}

/** L3 — mute status line muted=N unmuted=M. */
export function muteStatusLine(prefs: ChannelMutePrefs): string {
  const c = muteBoardCard(prefs);
  return `muted=${c.mutedCount} unmuted=${c.unmutedCount}`;
}

/** L3 — true when status line is fully unmuted. */
export function muteStatusLineIsEmpty(prefs: ChannelMutePrefs): boolean {
  return muteStatusLine(prefs) === 'muted=0 unmuted=3';
}

/** L3 — detailed mute status. */
export function muteStatusLineDetailed(prefs: ChannelMutePrefs): string {
  const c = muteBoardCard(prefs);
  return `muted=${c.mutedCount} unmuted=${c.unmutedCount} single=${c.single ? '1' : '0'} full=${c.fullyMuted ? '1' : '0'}`;
}

/** L3 — token count on detailed mute status. */
export function muteStatusLineTokenCount(prefs: ChannelMutePrefs): number {
  return muteStatusLineDetailed(prefs).split(/\s+/).filter(Boolean).length;
}

/** L3 — parse mute status line. Invalid → null. */
export function parseMuteStatusLine(line: string): { readonly muted: number; readonly unmuted: number } | null {
  const m = line.trim().match(/^muted=(\d+) unmuted=(\d+)$/);
  if (!m) return null;
  return { muted: Number(m[1]), unmuted: Number(m[2]) };
}

/** L3 — true when status line matches prefs. */
export function muteStatusLineMatches(prefs: ChannelMutePrefs): boolean {
  const p = parseMuteStatusLine(muteStatusLine(prefs));
  if (!p) return false;
  const c = muteBoardCard(prefs);
  return p.muted === c.mutedCount && p.unmuted === c.unmutedCount;
}

/** L3 — true when muted+unmuted equals 3. */
export function muteStatusLineConsistent(line: string): boolean {
  const p = parseMuteStatusLine(line);
  if (!p) return false;
  return p.muted + p.unmuted === 3;
}

/** L3 — true when muted count is within [min,max]. Invalid bounds → false. */
export function mutedCountInRange(prefs: ChannelMutePrefs, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = countMutedChannels(prefs);
  return n >= min && n <= max;
}

/** L3 — true when muted count is at least n. */
export function mutedCountAtLeast(prefs: ChannelMutePrefs, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return countMutedChannels(prefs) >= n;
}
