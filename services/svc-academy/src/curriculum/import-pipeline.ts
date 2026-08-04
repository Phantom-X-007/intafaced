/**
 * CURRICULUM IMPORT PIPELINE — Stage-1 (TRK-academy.curriculum).
 *
 * Does NOT invent the proprietary 20 playbooks + 3 workbooks. Those need a
 * licensed import or commissioned platform-native expansion (product/Class X).
 *
 * Stage-1 delivers:
 *   1. Content source decision (named, not guessed)
 *   2. Import record format + validation
 *   3. Brand-scan checklist for import bodies
 *   4. Count gate vs the tracker title promise
 */

import type { CurriculumItem, CurriculumKind, CurriculumPath } from './catalog.js';
import { CURRICULUM_PATHS, listCurriculum } from './catalog.js';

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

export type ImportValidationIssue =
  | { field: string; code: 'missing' | 'invalid' | 'brand' | 'path'; message: string };

export interface ImportValidationResult {
  ok: boolean;
  issues: ImportValidationIssue[];
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Brand-scan checklist for import bodies (§0.7).
 *
 * Does NOT list forbidden vendor strings in source (brand scanner would trip on
 * the test/file). Checks structural honesty only; full brand scan remains
 * `pnpm scan:brand` / DoD gate.
 */
export function brandChecklist(record: Pick<CurriculumImportRecord, 'title' | 'summary' | 'body'>): ImportValidationIssue[] {
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
   * true only when spine meets title counts. Today false — residual content.
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

/** Type helper: import record shape matches catalog item. */
export type ImportedCurriculumItem = CurriculumItem;
