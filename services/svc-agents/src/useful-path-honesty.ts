/**
 * Agents L3 — pure useful-path probe honesty boards (no gateway I/O).
 *
 * Catalog facts only: probe message key + completion capability name.
 */

export const USEFUL_PATH_PROBE_MESSAGE = 'agents.useful_path.probe';
export const USEFUL_PATH_CAPABILITY = 'complete';

export type UsefulPathResultInput = {
  readonly task: string;
  readonly textLen: number;
  readonly providerId: string;
  readonly model: string;
};

/** L3 — catalog board. */
export function usefulPathCatalogBoardCard(): {
  readonly probeKey: string;
  readonly capability: string;
  readonly hasSession: number;
  readonly hasLedger: number;
} {
  return {
    probeKey: USEFUL_PATH_PROBE_MESSAGE,
    capability: USEFUL_PATH_CAPABILITY,
    hasSession: 0,
    hasLedger: 0,
  };
}

/** L3 — catalog status line. */
export function usefulPathCatalogStatusLine(): string {
  const c = usefulPathCatalogBoardCard();
  return `probe=${c.probeKey} capability=${c.capability} session=${c.hasSession} ledger=${c.hasLedger}`;
}

/** L3 — parse catalog. */
export function parseUsefulPathCatalogStatusLine(line: string): {
  readonly probe: string;
  readonly capability: string;
  readonly session: number;
  readonly ledger: number;
} | null {
  const m = line.trim().match(/^probe=([a-z0-9._]+) capability=([a-z0-9_]+) session=([01]) ledger=([01])$/);
  if (!m) return null;
  return {
    probe: m[1]!,
    capability: m[2]!,
    session: Number(m[3]),
    ledger: Number(m[4]),
  };
}

/** L3 — true when catalog matches. */
export function usefulPathCatalogStatusLineMatches(): boolean {
  const p = parseUsefulPathCatalogStatusLine(usefulPathCatalogStatusLine());
  if (!p) return false;
  const c = usefulPathCatalogBoardCard();
  return p.probe === c.probeKey && p.capability === c.capability && p.session === c.hasSession && p.ledger === c.hasLedger;
}

/** L3 — thin path has no session/ledger. */
export function usefulPathCatalogStatusLineConsistent(line: string): boolean {
  const p = parseUsefulPathCatalogStatusLine(line);
  if (!p) return false;
  return p.session === 0 && p.ledger === 0 && p.capability === 'complete';
}

/** L3 — result board. */
export function usefulPathResultBoardCard(result: UsefulPathResultInput): {
  readonly task: string;
  readonly textLen: number;
  readonly hasProvider: number;
  readonly hasModel: number;
} {
  return {
    task: result.task,
    textLen: result.textLen,
    hasProvider: result.providerId.length > 0 ? 1 : 0,
    hasModel: result.model.length > 0 ? 1 : 0,
  };
}

/** L3 — result status line. */
export function usefulPathResultStatusLine(result: UsefulPathResultInput): string {
  const c = usefulPathResultBoardCard(result);
  return `task=${c.task} text_len=${c.textLen} provider=${c.hasProvider} model=${c.hasModel}`;
}

/** L3 — parse result. */
export function parseUsefulPathResultStatusLine(line: string): {
  readonly task: string;
  readonly textLen: number;
  readonly provider: number;
  readonly model: number;
} | null {
  const m = line.trim().match(/^task=([a-z0-9._-]+) text_len=(\d+) provider=([01]) model=([01])$/);
  if (!m) return null;
  return {
    task: m[1]!,
    textLen: Number(m[2]),
    provider: Number(m[3]),
    model: Number(m[4]),
  };
}

/** L3 — true when result status matches. */
export function usefulPathResultStatusLineMatches(result: UsefulPathResultInput): boolean {
  const p = parseUsefulPathResultStatusLine(usefulPathResultStatusLine(result));
  if (!p) return false;
  const c = usefulPathResultBoardCard(result);
  return p.task === c.task && p.textLen === c.textLen && p.provider === c.hasProvider && p.model === c.hasModel;
}

/** L3 — export header. */
export function usefulPathResultExportHeader(): string {
  return 'task,text_len,provider,model';
}

/** L3 — export line. */
export function usefulPathResultExportLine(result: UsefulPathResultInput): string {
  const c = usefulPathResultBoardCard(result);
  return `${c.task},${c.textLen},${c.hasProvider},${c.hasModel}`;
}

/** L3 — full export. */
export function usefulPathResultExportText(result: UsefulPathResultInput): string {
  return [usefulPathResultExportHeader(), usefulPathResultExportLine(result)].join('\n');
}
