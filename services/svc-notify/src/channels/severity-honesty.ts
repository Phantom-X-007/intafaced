/**
 * Notify L3 — pure notification severity catalog honesty (structural only).
 *
 * Mirrors channel.ts severity: info | action | critical.
 * Does not invent delivery SLAs or vendor channels.
 */

export const NOTIFY_SEVERITIES = ['info', 'action', 'critical'] as const;
export type NotifySeverityId = (typeof NOTIFY_SEVERITIES)[number];

/** L3 — catalog board. */
export function notifySeverityCatalogBoardCard(): {
  readonly severities: number;
  readonly hasInfo: number;
  readonly hasAction: number;
  readonly hasCritical: number;
} {
  return {
    severities: NOTIFY_SEVERITIES.length,
    hasInfo: NOTIFY_SEVERITIES.includes('info') ? 1 : 0,
    hasAction: NOTIFY_SEVERITIES.includes('action') ? 1 : 0,
    hasCritical: NOTIFY_SEVERITIES.includes('critical') ? 1 : 0,
  };
}

/** L3 — status line. */
export function notifySeverityCatalogStatusLine(): string {
  const c = notifySeverityCatalogBoardCard();
  return `severities=${c.severities} info=${c.hasInfo} action=${c.hasAction} critical=${c.hasCritical}`;
}

/** L3 — parse status. */
export function parseNotifySeverityCatalogStatusLine(line: string): {
  readonly severities: number;
  readonly info: number;
  readonly action: number;
  readonly critical: number;
} | null {
  const m = line.trim().match(/^severities=(\d+) info=([01]) action=([01]) critical=([01])$/);
  if (!m) return null;
  return {
    severities: Number(m[1]),
    info: Number(m[2]),
    action: Number(m[3]),
    critical: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function notifySeverityCatalogStatusLineMatches(): boolean {
  const p = parseNotifySeverityCatalogStatusLine(notifySeverityCatalogStatusLine());
  if (!p) return false;
  const c = notifySeverityCatalogBoardCard();
  return p.severities === c.severities && p.info === c.hasInfo && p.action === c.hasAction && p.critical === c.hasCritical;
}

/** L3 — three severities. */
export function notifySeverityCatalogStatusLineConsistent(line: string): boolean {
  const p = parseNotifySeverityCatalogStatusLine(line);
  if (!p) return false;
  return p.severities === 3 && p.info === 1 && p.action === 1 && p.critical === 1;
}

/** L3 — export header. */
export function notifySeverityCatalogExportHeader(): string {
  return 'severity';
}

/** L3 — export lines. */
export function notifySeverityCatalogExportLines(): readonly string[] {
  return [...NOTIFY_SEVERITIES];
}

/** L3 — full export. */
export function notifySeverityCatalogExportText(): string {
  return [notifySeverityCatalogExportHeader(), ...notifySeverityCatalogExportLines()].join('\n');
}

/** L3 — severity declared. */
export function isDeclaredNotifySeverity(sev: string): boolean {
  return (NOTIFY_SEVERITIES as readonly string[]).includes(sev);
}
