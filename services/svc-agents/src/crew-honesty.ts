/**
 * Agents L3 — pure crew channel honesty boards (no bus I/O).
 *
 * Shapes mirror crew-events.ts MemoryCrewChannelOpener / CrewChannel.
 * Does not mount the NOT WIRED subscription — boards only.
 */

export type CrewChannelInput = {
  readonly crewId: string;
  readonly userId: string;
  readonly role: string;
};

/** L3 — channel count. */
export function crewChannelCount(channels: readonly CrewChannelInput[]): number {
  return channels.length;
}

/** L3 — unique crew ids. */
export function uniqueCrewIds(channels: readonly CrewChannelInput[]): readonly string[] {
  return [...new Set(channels.map((c) => c.crewId))].sort();
}

/** L3 — unique user ids. */
export function uniqueCrewUserIds(channels: readonly CrewChannelInput[]): readonly string[] {
  return [...new Set(channels.map((c) => c.userId))].sort();
}

/** L3 — role histogram. */
export function crewRoleHistogram(channels: readonly CrewChannelInput[]): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const c of channels) {
    out[c.role] = (out[c.role] ?? 0) + 1;
  }
  return out;
}

/** L3 — board card. */
export function crewChannelBoardCard(channels: readonly CrewChannelInput[]): {
  readonly channels: number;
  readonly crews: number;
  readonly users: number;
  readonly roles: number;
} {
  const roles = new Set(channels.map((c) => c.role));
  return {
    channels: channels.length,
    crews: uniqueCrewIds(channels).length,
    users: uniqueCrewUserIds(channels).length,
    roles: roles.size,
  };
}

/** L3 — status line. */
export function crewChannelStatusLine(channels: readonly CrewChannelInput[]): string {
  const c = crewChannelBoardCard(channels);
  return `channels=${c.channels} crews=${c.crews} users=${c.users} roles=${c.roles}`;
}

/** L3 — parse status. Invalid → null. */
export function parseCrewChannelStatusLine(line: string): {
  readonly channels: number;
  readonly crews: number;
  readonly users: number;
  readonly roles: number;
} | null {
  const m = line.trim().match(/^channels=(\d+) crews=(\d+) users=(\d+) roles=(\d+)$/);
  if (!m) return null;
  return {
    channels: Number(m[1]),
    crews: Number(m[2]),
    users: Number(m[3]),
    roles: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function crewChannelStatusLineMatches(channels: readonly CrewChannelInput[]): boolean {
  const p = parseCrewChannelStatusLine(crewChannelStatusLine(channels));
  if (!p) return false;
  const c = crewChannelBoardCard(channels);
  return p.channels === c.channels && p.crews === c.crews && p.users === c.users && p.roles === c.roles;
}

/** L3 — true when crews/users/roles cannot exceed channels. */
export function crewChannelStatusLineConsistent(line: string): boolean {
  const p = parseCrewChannelStatusLine(line);
  if (!p) return false;
  return p.crews <= p.channels && p.users <= p.channels && p.roles <= p.channels;
}

/** L3 — export header. */
export function crewChannelExportHeader(): string {
  return 'channels,crews,users,roles';
}

/** L3 — export line. */
export function crewChannelExportLine(channels: readonly CrewChannelInput[]): string {
  const c = crewChannelBoardCard(channels);
  return `${c.channels},${c.crews},${c.users},${c.roles}`;
}

/** L3 — full export. */
export function crewChannelExportText(channels: readonly CrewChannelInput[]): string {
  return [crewChannelExportHeader(), crewChannelExportLine(channels)].join('\n');
}

/** L3 — true when no channels. */
export function crewChannelListEmpty(channels: readonly CrewChannelInput[]): boolean {
  return channels.length === 0;
}

/** L3 — channel count in inclusive range. */
export function crewChannelCountInRange(
  channels: readonly CrewChannelInput[],
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = channels.length;
  return n >= min && n <= max;
}

/** L3 — has crew id. */
export function crewHasId(channels: readonly CrewChannelInput[], crewId: string): boolean {
  return channels.some((c) => c.crewId === crewId);
}
