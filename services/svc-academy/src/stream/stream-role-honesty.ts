/**
 * Academy L3 — pure stream role + provider honesty boards (no SFU I/O).
 *
 * Roles mirror StreamProvider credential role union. Null provider refuses.
 */

export const STREAM_ROLES = ['host', 'speaker', 'attendee'] as const;
export type StreamRoleId = (typeof STREAM_ROLES)[number];

/** L3 — role catalog board. */
export function streamRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasHost: number;
  readonly hasAttendee: number;
} {
  return {
    roles: STREAM_ROLES.length,
    hasHost: STREAM_ROLES.includes('host') ? 1 : 0,
    hasAttendee: STREAM_ROLES.includes('attendee') ? 1 : 0,
  };
}

/** L3 — role status line. */
export function streamRoleCatalogStatusLine(): string {
  const c = streamRoleCatalogBoardCard();
  return `roles=${c.roles} host=${c.hasHost} attendee=${c.hasAttendee}`;
}

/** L3 — parse role. */
export function parseStreamRoleCatalogStatusLine(line: string): {
  readonly roles: number;
  readonly host: number;
  readonly attendee: number;
} | null {
  const m = line.trim().match(/^roles=(\d+) host=([01]) attendee=([01])$/);
  if (!m) return null;
  return {
    roles: Number(m[1]),
    host: Number(m[2]),
    attendee: Number(m[3]),
  };
}

/** L3 — true when role catalog matches. */
export function streamRoleCatalogStatusLineMatches(): boolean {
  const p = parseStreamRoleCatalogStatusLine(streamRoleCatalogStatusLine());
  if (!p) return false;
  const c = streamRoleCatalogBoardCard();
  return p.roles === c.roles && p.host === c.hasHost && p.attendee === c.hasAttendee;
}

/** L3 — three roles. */
export function streamRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parseStreamRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.roles === 3 && p.host === 1 && p.attendee === 1;
}

export type StreamProviderUsabilityBoardInput = {
  readonly providerId: string;
  readonly usable: boolean;
};

/** L3 — provider usability board (null SFU is unusable). */
export function streamProviderBoardCard(input: StreamProviderUsabilityBoardInput): {
  readonly provider: string;
  readonly usable: number;
  readonly refuses: number;
} {
  return {
    provider: input.providerId,
    usable: input.usable ? 1 : 0,
    refuses: input.usable ? 0 : 1,
  };
}

/** L3 — provider status line. */
export function streamProviderStatusLine(input: StreamProviderUsabilityBoardInput): string {
  const c = streamProviderBoardCard(input);
  return `provider=${c.provider} usable=${c.usable} refuses=${c.refuses}`;
}

/** L3 — parse provider. */
export function parseStreamProviderStatusLine(line: string): {
  readonly provider: string;
  readonly usable: number;
  readonly refuses: number;
} | null {
  const m = line.trim().match(/^provider=([a-z0-9_-]+) usable=([01]) refuses=([01])$/);
  if (!m) return null;
  return {
    provider: m[1]!,
    usable: Number(m[2]),
    refuses: Number(m[3]),
  };
}

/** L3 — true when provider status matches. */
export function streamProviderStatusLineMatches(
  input: StreamProviderUsabilityBoardInput,
): boolean {
  const p = parseStreamProviderStatusLine(streamProviderStatusLine(input));
  if (!p) return false;
  const c = streamProviderBoardCard(input);
  return p.provider === c.provider && p.usable === c.usable && p.refuses === c.refuses;
}

/** L3 — usable XOR refuses. */
export function streamProviderStatusLineConsistent(line: string): boolean {
  const p = parseStreamProviderStatusLine(line);
  if (!p) return false;
  return p.usable + p.refuses === 1;
}

/** L3 — role declared. */
export function isDeclaredStreamRole(role: string): boolean {
  return (STREAM_ROLES as readonly string[]).includes(role);
}

/** L3 — export header. */
export function streamRoleCatalogExportHeader(): string {
  return 'role';
}

/** L3 — export lines. */
export function streamRoleCatalogExportLines(): readonly string[] {
  return [...STREAM_ROLES];
}

/** L3 — full export. */
export function streamRoleCatalogExportText(): string {
  return [streamRoleCatalogExportHeader(), ...streamRoleCatalogExportLines()].join('\n');
}
