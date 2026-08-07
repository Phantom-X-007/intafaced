/**
 * CURRICULUM IMPORT PIPELINE — Stage-1 + Stage-3 honesty (TRK-academy.curriculum).
 *
 * Does NOT invent a licensed third-party library dump. Platform-native expansion
 * may close title counts; licensed import remains product/Class X when assets land.
 *
 * Stage-1 delivers:
 *   1. Content source decision (named, not guessed)
 *   2. Import record format + validation
 *   3. Brand-scan checklist for import bodies
 *   4. Count gate vs the tracker title promise
 *
 * Stage-3 extends import status:
 *   5. Workbook bodies must not paint fake market prices as live quotes
 *   6. Operator stage status (pipeline / catalog / polish) for honest residual
 */

import type { CurriculumItem, CurriculumKind, CurriculumPath } from './catalog.js';
import { CURRICULUM_PATHS, listCurriculum } from './catalog.js';
import { curriculumDeepLinksVerified } from './deep-links.js';
import { curriculumI18nStrategyHonest } from './i18n-strategy.js';

/** Tracker title promise (academy.curriculum). */
export const CURRICULUM_TITLE_PLAYBOOKS = 20;
export const CURRICULUM_TITLE_WORKBOOKS = 3;

/**
 * Product decision on tip: we expand platform-native content until a licence
 * lands. We do NOT claim a licensed DERIV//DESK import is in-repo.
 */
export type CurriculumContentSource = 'platform-native-expansion' | 'licensed-import-pending';

export const CURRICULUM_CONTENT_SOURCE: CurriculumContentSource = 'platform-native-expansion';

/** One importable curriculum record (file or future CMS row). */
export interface CurriculumImportRecord {
  slug: string;
  title: string;
  kind: CurriculumKind;
  path: CurriculumPath;
  order: number;
  summary: string;
  body: string;
}

export type ImportValidationIssue = { field: string; code: 'missing' | 'invalid' | 'brand' | 'path'; message: string };

export interface ImportValidationResult {
  ok: boolean;
  issues: ImportValidationIssue[];
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Workbook honesty — refuse bodies that paint invented prices as live quotes.
 * Outline drills may talk about books/fills in the abstract; they must not
 * embed bid/ask/last/mid numbers as if they were a live market feed.
 */
export function workbookLiveQuoteChecklist(
  record: Pick<CurriculumImportRecord, 'kind' | 'title' | 'summary' | 'body'>,
): ImportValidationIssue[] {
  if (record.kind !== 'workbook') return [];
  const blob = `${record.title}\n${record.summary}\n${record.body}`;
  const issues: ImportValidationIssue[] = [];

  if (/\blive\s+quote\b/i.test(blob) || /\blive\s+ticker\b/i.test(blob)) {
    issues.push({
      field: 'body',
      code: 'invalid',
      message: 'Workbook must not claim a live quote/ticker — paper outlines only until trade paper path',
    });
  }
  // bid/ask/last/mid followed by a numeric price looks like a painted feed
  if (/\b(?:bid|ask|last|mid)\s*[:=]\s*\$?\d+(?:\.\d+)?/i.test(blob)) {
    issues.push({
      field: 'body',
      code: 'invalid',
      message: 'Workbook must not embed bid/ask/last/mid prices as live quotes',
    });
  }
  if (/\bcurrent\s+price\s*[:=]\s*\$?\d+/i.test(blob) || /\bspot\s+price\s*[:=]\s*\$?\d+/i.test(blob)) {
    issues.push({
      field: 'body',
      code: 'invalid',
      message: 'Workbook must not paint a current/spot price as a live market quote',
    });
  }
  return issues;
}

/**
 * Brand-scan checklist for import bodies (§0.7).
 *
 * Does NOT list forbidden vendor strings in source (brand scanner would trip on
 * the test/file). Checks structural honesty only; full brand scan remains
 * `pnpm scan:brand` / DoD gate.
 */
export function brandChecklist(
  record: Pick<CurriculumImportRecord, 'title' | 'summary' | 'body'> & { kind?: CurriculumKind },
): ImportValidationIssue[] {
  const issues: ImportValidationIssue[] = [];
  const blob = `${record.title}\n${record.summary}\n${record.body}`;

  if (blob.includes('http://') || blob.includes('https://')) {
    issues.push({
      field: 'body',
      code: 'brand',
      message: 'Import bodies must not embed outbound URLs — link policy is platform-owned',
    });
  }
  // Placeholder patterns that usually mean "vendor dump not rewritten"
  if (/\bTODO: *translate\b/i.test(blob) || /\bFIXME: *brand\b/i.test(blob)) {
    issues.push({
      field: 'body',
      code: 'brand',
      message: 'Import still carries brand/translate placeholders — rewrite before merge',
    });
  }
  if (record.title.trim().length === 0 || record.summary.trim().length < 12) {
    issues.push({
      field: 'summary',
      code: 'invalid',
      message: 'Title required; summary min 12 characters (no empty stubs painted complete)',
    });
  }
  if (record.body.trim().length < 40 || !record.body.trimStart().startsWith('#')) {
    issues.push({
      field: 'body',
      code: 'invalid',
      message: 'Body must be real markdown (≥40 chars, starts with # heading)',
    });
  }
  if (record.kind === 'workbook') {
    issues.push(...workbookLiveQuoteChecklist({ kind: 'workbook', title: record.title, summary: record.summary, body: record.body }));
  }
  return issues;
}

export function validateImportRecord(raw: unknown): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, issues: [{ field: '_', code: 'invalid', message: 'Import record must be an object' }] };
  }
  const r = raw as Record<string, unknown>;

  const slug = typeof r.slug === 'string' ? r.slug : '';
  if (!SLUG_RE.test(slug) || slug.length > 120) {
    issues.push({ field: 'slug', code: 'invalid', message: 'slug: lowercase alphanumeric + hyphen, max 120' });
  }

  const kind = r.kind;
  if (kind !== 'playbook' && kind !== 'workbook' && kind !== 'lesson') {
    issues.push({ field: 'kind', code: 'invalid', message: 'kind must be playbook|workbook|lesson' });
  }

  const path = r.path;
  if (typeof path !== 'string' || !(CURRICULUM_PATHS as readonly string[]).includes(path)) {
    issues.push({ field: 'path', code: 'path', message: `path must be one of ${CURRICULUM_PATHS.join('|')}` });
  }

  if (typeof r.order !== 'number' || !Number.isInteger(r.order) || r.order < 0 || r.order > 10_000) {
    issues.push({ field: 'order', code: 'invalid', message: 'order must be integer 0…10000' });
  }

  if (typeof r.title !== 'string') issues.push({ field: 'title', code: 'missing', message: 'title required' });
  if (typeof r.summary !== 'string') issues.push({ field: 'summary', code: 'missing', message: 'summary required' });
  if (typeof r.body !== 'string') issues.push({ field: 'body', code: 'missing', message: 'body required' });

  if (issues.length === 0) {
    issues.push(
      ...brandChecklist({
        kind: r.kind as CurriculumKind,
        title: r.title as string,
        summary: r.summary as string,
        body: r.body as string,
      }),
    );
  }

  return { ok: issues.length === 0, issues };
}

export interface CurriculumInventory {
  contentSource: CurriculumContentSource;
  /** Day-one spine counts on tip (honest — not the title promise). */
  spine: { total: number; playbooks: number; workbooks: number; lessons: number };
  /** Tracker title targets. */
  titleTarget: { playbooks: number; workbooks: number };
  /**
   * true only when spine meets title counts (platform-native expansion may close this).
   * Do not flip tracker `done` while this is false unless product renames the title.
   */
  titlePromiseMet: boolean;
  residualPlaybooks: number;
  residualWorkbooks: number;
}

export function curriculumInventory(): CurriculumInventory {
  const all = listCurriculum();
  const playbooks = all.filter((i) => i.kind === 'playbook').length;
  const workbooks = all.filter((i) => i.kind === 'workbook').length;
  const lessons = all.filter((i) => i.kind === 'lesson').length;
  const residualPlaybooks = Math.max(0, CURRICULUM_TITLE_PLAYBOOKS - playbooks);
  const residualWorkbooks = Math.max(0, CURRICULUM_TITLE_WORKBOOKS - workbooks);
  return {
    contentSource: CURRICULUM_CONTENT_SOURCE,
    spine: { total: all.length, playbooks, workbooks, lessons },
    titleTarget: { playbooks: CURRICULUM_TITLE_PLAYBOOKS, workbooks: CURRICULUM_TITLE_WORKBOOKS },
    titlePromiseMet: residualPlaybooks === 0 && residualWorkbooks === 0,
    residualPlaybooks,
    residualWorkbooks,
  };
}

/** Parse a JSON array of import records; validate each. */
export function validateImportBatch(raw: unknown): { ok: boolean; accepted: number; results: ImportValidationResult[] } {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      accepted: 0,
      results: [{ ok: false, issues: [{ field: '_', code: 'invalid', message: 'Import batch must be a JSON array' }] }],
    };
  }
  const results = raw.map((item) => validateImportRecord(item));
  const accepted = results.filter((r) => r.ok).length;
  return { ok: results.every((r) => r.ok), accepted, results };
}

/**
 * L3 — operator summary of a batch validation. Does not invent accepted rows.
 */
export type ImportBatchSummary = {
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly ok: boolean;
};

export function summarizeImportBatch(batch: {
  readonly ok: boolean;
  readonly accepted: number;
  readonly results: readonly ImportValidationResult[];
}): ImportBatchSummary {
  const total = batch.results.length;
  const accepted = batch.accepted;
  return {
    total,
    accepted,
    rejected: Math.max(0, total - accepted),
    ok: batch.ok,
  };
}

/**
 * L3 — rejected count from summary (honest zero when all accepted).
 */
export function importBatchRejectedCount(summary: ImportBatchSummary): number {
  return summary.rejected;
}

/** Type helper: import record shape matches catalog item. */
export type ImportedCurriculumItem = CurriculumItem;

/** L3 — import batch board card (honest zeros). */
export function importBatchBoardCard(summary: ImportBatchSummary): {
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly ok: boolean;
} {
  return {
    total: summary.total,
    accepted: summary.accepted,
    rejected: summary.rejected,
    ok: summary.ok,
  };
}

/** L3 — import status line total=A accepted=B rejected=C. */
export function importBatchStatusLine(summary: ImportBatchSummary): string {
  return `total=${summary.total} accepted=${summary.accepted} rejected=${summary.rejected}`;
}

/** L3 — true when total is 0. */
export function importBatchStatusLineIsEmpty(summary: ImportBatchSummary): boolean {
  return summary.total === 0;
}

/** L3 — detailed import status. */
export function importBatchStatusLineDetailed(summary: ImportBatchSummary): string {
  return `total=${summary.total} accepted=${summary.accepted} rejected=${summary.rejected} ok=${summary.ok ? '1' : '0'}`;
}

/** L3 — parse import status line. Invalid → null. */
export function parseImportBatchStatusLine(
  line: string,
): { readonly total: number; readonly accepted: number; readonly rejected: number } | null {
  const m = line.trim().match(/^total=(\d+) accepted=(\d+) rejected=(\d+)$/);
  if (!m) return null;
  return { total: Number(m[1]), accepted: Number(m[2]), rejected: Number(m[3]) };
}

/** L3 — true when status matches summary. */
export function importBatchStatusLineMatches(summary: ImportBatchSummary): boolean {
  const p = parseImportBatchStatusLine(importBatchStatusLine(summary));
  if (!p) return false;
  return p.total === summary.total && p.accepted === summary.accepted && p.rejected === summary.rejected;
}

/** L3 — true when accepted+rejected equals total. */
export function importBatchStatusLineConsistent(line: string): boolean {
  const p = parseImportBatchStatusLine(line);
  if (!p) return false;
  return p.total === p.accepted + p.rejected;
}

/** L3 — export header for import summary. */
export function importBatchExportHeader(): string {
  return 'total,accepted,rejected,ok';
}

/** L3 — export line for import summary. */
export function importBatchExportLine(summary: ImportBatchSummary): string {
  return `${summary.total},${summary.accepted},${summary.rejected},${summary.ok ? '1' : '0'}`;
}

/** L3 — full export text. */
export function importBatchExportText(summary: ImportBatchSummary): string {
  return [importBatchExportHeader(), importBatchExportLine(summary)].join('\n');
}

/** L3 — parse import export line. Invalid → null. */
export function parseImportBatchExportLine(
  line: string,
): { readonly total: number; readonly accepted: number; readonly rejected: number; readonly ok: boolean } | null {
  const t = line.trim();
  if (!t || t === importBatchExportHeader()) return null;
  const parts = t.split(',');
  if (parts.length !== 4) return null;
  const total = Number(parts[0]);
  const accepted = Number(parts[1]);
  const rejected = Number(parts[2]);
  const okFlag = parts[3]!.trim();
  if (![total, accepted, rejected].every((n) => Number.isFinite(n) && n >= 0)) return null;
  if (okFlag !== '0' && okFlag !== '1') return null;
  return { total: Math.floor(total), accepted: Math.floor(accepted), rejected: Math.floor(rejected), ok: okFlag === '1' };
}

/** L3 — true when accepted is within [min,max]. Invalid → false. */
export function importAcceptedInRange(summary: ImportBatchSummary, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  return summary.accepted >= min && summary.accepted <= max;
}

/** L3 — true when rejected is at most n. */
export function importRejectedAtMost(summary: ImportBatchSummary, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return summary.rejected <= n;
}

/**
 * Stage-3 operator status for the import/catalog/polish DoD.
 * Honest flags only — does not invent licensed library content.
 */
export type CurriculumImportStageStatus = {
  readonly contentSource: CurriculumContentSource;
  readonly titlePromiseMet: boolean;
  readonly residualPlaybooks: number;
  readonly residualWorkbooks: number;
  /** Stage-1 pipeline surface present (validation + inventory). */
  readonly stage1Pipeline: true;
  /** Stage-2 catalog expansion closed when title counts met via platform-native set. */
  readonly stage2CatalogExpanded: boolean;
  /** Stage-3 polish: deep-links + i18n strategy honest. */
  readonly stage3Polish: {
    readonly deepLinksVerified: boolean;
    readonly i18nStrategyHonest: boolean;
    readonly ready: boolean;
  };
};

export function curriculumImportStageStatus(): CurriculumImportStageStatus {
  const inv = curriculumInventory();
  const deepLinksVerified = curriculumDeepLinksVerified();
  const i18nStrategyHonest = curriculumI18nStrategyHonest();
  return {
    contentSource: inv.contentSource,
    titlePromiseMet: inv.titlePromiseMet,
    residualPlaybooks: inv.residualPlaybooks,
    residualWorkbooks: inv.residualWorkbooks,
    stage1Pipeline: true,
    stage2CatalogExpanded: inv.titlePromiseMet,
    stage3Polish: {
      deepLinksVerified,
      i18nStrategyHonest,
      ready: deepLinksVerified && i18nStrategyHonest,
    },
  };
}

/** One-line import/status for operators. */
export function curriculumImportStageStatusLine(): string {
  const s = curriculumImportStageStatus();
  return [
    `source=${s.contentSource}`,
    `titleMet=${s.titlePromiseMet ? '1' : '0'}`,
    `residualPb=${s.residualPlaybooks}`,
    `residualWb=${s.residualWorkbooks}`,
    `stage3=${s.stage3Polish.ready ? '1' : '0'}`,
  ].join(' ');
}
