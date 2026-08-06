/**
 * Agents L3 — pure user-facing copy key catalog honesty (no i18n I/O).
 *
 * Mirrors copy.ts COPY_KEYS structural groups. Does not invent vendor strings.
 */

export const COPY_KEY_PREFIX = 'agents.';

/** L3 — input is the declared key list from copy.ts (caller supplies). */
export type CopyKeyBoardInput = readonly string[];

/** L3 — group histogram by second segment (session/action/refused/error/…). */
export function copyKeyGroupHistogram(keys: CopyKeyBoardInput): Readonly<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const parts = k.split('.');
    const group = parts.length >= 2 ? parts[1]! : 'unknown';
    out[group] = (out[group] ?? 0) + 1;
  }
  return out;
}

/** L3 — count of keys that start with agents. */
export function copyKeysWithAgentsPrefix(keys: CopyKeyBoardInput): number {
  return keys.filter((k) => k.startsWith(COPY_KEY_PREFIX)).length;
}

/** L3 — board card. */
export function copyCatalogBoardCard(keys: CopyKeyBoardInput): {
  readonly keys: number;
  readonly agentsPrefix: number;
  readonly refused: number;
  readonly error: number;
  readonly groups: number;
} {
  const h = copyKeyGroupHistogram(keys);
  return {
    keys: keys.length,
    agentsPrefix: copyKeysWithAgentsPrefix(keys),
    refused: h.refused ?? 0,
    error: h.error ?? 0,
    groups: Object.keys(h).length,
  };
}

/** L3 — status line. */
export function copyCatalogStatusLine(keys: CopyKeyBoardInput): string {
  const c = copyCatalogBoardCard(keys);
  return `keys=${c.keys} agents_prefix=${c.agentsPrefix} refused=${c.refused} error=${c.error} groups=${c.groups}`;
}

/** L3 — parse status. */
export function parseCopyCatalogStatusLine(line: string): {
  readonly keys: number;
  readonly agentsPrefix: number;
  readonly refused: number;
  readonly error: number;
  readonly groups: number;
} | null {
  const m = line.trim().match(/^keys=(\d+) agents_prefix=(\d+) refused=(\d+) error=(\d+) groups=(\d+)$/);
  if (!m) return null;
  return {
    keys: Number(m[1]),
    agentsPrefix: Number(m[2]),
    refused: Number(m[3]),
    error: Number(m[4]),
    groups: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function copyCatalogStatusLineMatches(keys: CopyKeyBoardInput): boolean {
  const p = parseCopyCatalogStatusLine(copyCatalogStatusLine(keys));
  if (!p) return false;
  const c = copyCatalogBoardCard(keys);
  return p.keys === c.keys && p.agentsPrefix === c.agentsPrefix && p.refused === c.refused && p.error === c.error && p.groups === c.groups;
}

/** L3 — agents_prefix ≤ keys; refused/error ≤ keys. */
export function copyCatalogStatusLineConsistent(line: string): boolean {
  const p = parseCopyCatalogStatusLine(line);
  if (!p) return false;
  return p.agentsPrefix <= p.keys && p.refused <= p.keys && p.error <= p.keys && p.groups <= p.keys;
}

/** L3 — export header. */
export function copyCatalogExportHeader(): string {
  return 'keys,agents_prefix,refused,error,groups';
}

/** L3 — export line. */
export function copyCatalogExportLine(keys: CopyKeyBoardInput): string {
  const c = copyCatalogBoardCard(keys);
  return `${c.keys},${c.agentsPrefix},${c.refused},${c.error},${c.groups}`;
}

/** L3 — full export. */
export function copyCatalogExportText(keys: CopyKeyBoardInput): string {
  return [copyCatalogExportHeader(), copyCatalogExportLine(keys)].join('\n');
}

/** L3 — true when every key uses agents. prefix. */
export function copyCatalogAllAgentsPrefixed(keys: CopyKeyBoardInput): boolean {
  return keys.length > 0 && copyKeysWithAgentsPrefix(keys) === keys.length;
}

/** L3 — key declared in list. */
export function copyCatalogHasKey(keys: CopyKeyBoardInput, key: string): boolean {
  return keys.includes(key);
}

/** L3 — count in range. */
export function copyKeyCountInRange(keys: CopyKeyBoardInput, min: number, max: number): boolean {
  if (min > max) return false;
  const n = keys.length;
  return n >= min && n <= max;
}
