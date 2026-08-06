/**
 * Academy L3 — pure reconnect source/refuse honesty boards (no invent scene).
 *
 * Sources: server | local_draft | empty_default. Refuse: server_invalid | local_invalid.
 */

export const RECONNECT_OK_SOURCES = ['server', 'local_draft', 'empty_default'] as const;
export const RECONNECT_REFUSE_REASONS = ['server_invalid', 'local_invalid'] as const;

export type ReconnectBoardInput =
  | { readonly status: 'ok'; readonly source: (typeof RECONNECT_OK_SOURCES)[number] }
  | { readonly status: 'refuse'; readonly reason: (typeof RECONNECT_REFUSE_REASONS)[number] };

/** L3 — catalog board. */
export function reconnectCatalogBoardCard(): {
  readonly okSources: number;
  readonly refuseReasons: number;
  readonly inventsScene: number;
} {
  return {
    okSources: RECONNECT_OK_SOURCES.length,
    refuseReasons: RECONNECT_REFUSE_REASONS.length,
    inventsScene: 0,
  };
}

/** L3 — catalog status line. */
export function reconnectCatalogStatusLine(): string {
  const c = reconnectCatalogBoardCard();
  return `ok_sources=${c.okSources} refuse_reasons=${c.refuseReasons} invent=${c.inventsScene}`;
}

/** L3 — parse catalog. */
export function parseReconnectCatalogStatusLine(line: string): {
  readonly okSources: number;
  readonly refuseReasons: number;
  readonly invent: number;
} | null {
  const m = line.trim().match(/^ok_sources=(\d+) refuse_reasons=(\d+) invent=([01])$/);
  if (!m) return null;
  return {
    okSources: Number(m[1]),
    refuseReasons: Number(m[2]),
    invent: Number(m[3]),
  };
}

/** L3 — true when catalog matches. */
export function reconnectCatalogStatusLineMatches(): boolean {
  const p = parseReconnectCatalogStatusLine(reconnectCatalogStatusLine());
  if (!p) return false;
  const c = reconnectCatalogBoardCard();
  return p.okSources === c.okSources && p.refuseReasons === c.refuseReasons && p.invent === c.inventsScene;
}

/** L3 — never invent scene. */
export function reconnectCatalogStatusLineConsistent(line: string): boolean {
  const p = parseReconnectCatalogStatusLine(line);
  if (!p) return false;
  return p.invent === 0 && p.okSources === 3 && p.refuseReasons === 2;
}

/** L3 — result board. */
export function reconnectResultBoardCard(result: ReconnectBoardInput): {
  readonly status: string;
  readonly source: string;
  readonly reason: string;
} {
  if (result.status === 'ok') {
    return { status: 'ok', source: result.source, reason: '-' };
  }
  return { status: 'refuse', source: '-', reason: result.reason };
}

/** L3 — result status line. */
export function reconnectResultStatusLine(result: ReconnectBoardInput): string {
  const c = reconnectResultBoardCard(result);
  return `status=${c.status} source=${c.source} reason=${c.reason}`;
}

/** L3 — parse result. */
export function parseReconnectResultStatusLine(line: string): {
  readonly status: string;
  readonly source: string;
  readonly reason: string;
} | null {
  const m = line.trim().match(/^status=(ok|refuse) source=([a-z0-9_-]+) reason=([a-z0-9_-]+)$/);
  if (!m) return null;
  return {
    status: m[1]!,
    source: m[2]!,
    reason: m[3]!,
  };
}

/** L3 — true when result matches. */
export function reconnectResultStatusLineMatches(result: ReconnectBoardInput): boolean {
  const p = parseReconnectResultStatusLine(reconnectResultStatusLine(result));
  if (!p) return false;
  const c = reconnectResultBoardCard(result);
  return p.status === c.status && p.source === c.source && p.reason === c.reason;
}

/** L3 — refuse has no source. */
export function reconnectResultStatusLineConsistent(line: string): boolean {
  const p = parseReconnectResultStatusLine(line);
  if (!p) return false;
  if (p.status === 'refuse') return p.source === '-';
  return p.reason === '-';
}

/** L3 — export header. */
export function reconnectResultExportHeader(): string {
  return 'status,source,reason';
}

/** L3 — export line. */
export function reconnectResultExportLine(result: ReconnectBoardInput): string {
  const c = reconnectResultBoardCard(result);
  return `${c.status},${c.source},${c.reason}`;
}

/** L3 — full export. */
export function reconnectResultExportText(result: ReconnectBoardInput): string {
  return [reconnectResultExportHeader(), reconnectResultExportLine(result)].join('\n');
}

/** L3 — source declared. */
export function isDeclaredReconnectSource(source: string): boolean {
  return (RECONNECT_OK_SOURCES as readonly string[]).includes(source);
}

/** L3 — refuse reason declared. */
export function isDeclaredReconnectRefuseReason(reason: string): boolean {
  return (RECONNECT_REFUSE_REASONS as readonly string[]).includes(reason);
}
