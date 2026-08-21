/**
 * D26-P1-C5 — import substance bar, named refuses (not char-count theater).
 *
 * Empty / whitespace / length-padded junk refuse by stable code. An accepted
 * import must carry structured lesson substance: ## sections, instructional
 * steps, and checkable objectives. Length alone never clears the bar.
 *
 * Grading / XP stay on `academy.certs`. This module does not invent IFC.
 */

export const CURRICULUM_IMPORT_REFUSE = {
  empty: 'academy.curriculum_empty',
  whitespace: 'academy.curriculum_whitespace',
  paddedJunk: 'academy.curriculum_padded_junk',
  missingSections: 'academy.curriculum_missing_sections',
  missingSteps: 'academy.curriculum_missing_steps',
  missingObjectives: 'academy.curriculum_missing_objectives',
} as const;

export type CurriculumImportRefuseCode = (typeof CURRICULUM_IMPORT_REFUSE)[keyof typeof CURRICULUM_IMPORT_REFUSE];

export type LessonSubstanceIssue = {
  readonly field: 'body' | 'objectives';
  readonly code: CurriculumImportRefuseCode;
  readonly message: string;
};

export type LessonSubstanceInput = {
  readonly body: string;
  readonly objectives?: unknown;
};

const MIN_SECTIONS = 2;
const MIN_STEPS = 2;
const MIN_OBJECTIVES = 2;
const MIN_OBJECTIVE_CHARS = 20;
const MIN_UNIQUE_WORDS = 90;
const MIN_UNIQUE_RATIO = 0.28;
const PAD_LINE_REPEATS = 4;

function issue(field: LessonSubstanceIssue['field'], code: CurriculumImportRefuseCode, message: string): LessonSubstanceIssue {
  return { field, code, message };
}

/** Named empty vs whitespace — length-0 is empty; only spaces/newlines is whitespace. */
export function classifyEmptyBody(body: string): CurriculumImportRefuseCode | null {
  if (body.length === 0) return CURRICULUM_IMPORT_REFUSE.empty;
  if (body.trim().length === 0) return CURRICULUM_IMPORT_REFUSE.whitespace;
  return null;
}

export function countMarkdownSections(body: string): number {
  return (body.match(/^## .+$/gm) ?? []).length;
}

/** Instructional steps: lists, drill/step headings, or bold lead-ins (mode/check items). */
export function countInstructionalSteps(body: string): number {
  const list = body.split(/\n/).filter((line) => /^\s*(?:\d+\.|[-*])\s+\S/.test(line)).length;
  const boldLeads = body.split(/\n/).filter((line) => /^\*\*[^*]{3,}\*\*/.test(line.trim())).length;
  const namedHeads = (body.match(/^## (?:Drill|Step|Checklist)\b/gim) ?? []).length;
  return list + boldLeads + namedHeads;
}

export function normalizeObjectives(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (t.length >= MIN_OBJECTIVE_CHARS) out.push(t);
  }
  return out;
}

/** Bullets under `## Objectives` / `## Learning objectives`. */
export function parseObjectivesFromBody(body: string): string[] {
  const lines = body.split(/\n/);
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{2,3}\s+(learning\s+)?objectives\b/i.test(trimmed)) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^#{2,3}\s+\S/.test(trimmed)) break;
    if (!inBlock) continue;
    const m = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+\S)/);
    if (m?.[1] && m[1].trim().length >= MIN_OBJECTIVE_CHARS) out.push(m[1].trim());
  }
  return out;
}

function isLengthPaddedJunk(body: string): boolean {
  const trimmed = body.trim();
  const words = trimmed
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 0);
  const unique = new Set(words);
  const uniqueRatio = words.length === 0 ? 0 : unique.size / words.length;
  if (unique.size < MIN_UNIQUE_WORDS) return true;
  if (uniqueRatio < MIN_UNIQUE_RATIO) return true;

  const longLines = trimmed
    .split(/\n+/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length >= 48 && !line.startsWith('#'));
  const lineCounts = new Map<string, number>();
  let maxRep = 0;
  for (const line of longLines) {
    const n = (lineCounts.get(line) ?? 0) + 1;
    lineCounts.set(line, n);
    if (n > maxRep) maxRep = n;
  }
  return maxRep >= PAD_LINE_REPEATS;
}

/**
 * Named substance gate for one import body (+ optional objectives field).
 * Callers that only have markdown still pass `{ body }`.
 */
export function lessonSubstanceChecklist(body: string, extras?: { readonly objectives?: unknown }): LessonSubstanceIssue[] {
  const emptyCode = classifyEmptyBody(body);
  if (emptyCode === CURRICULUM_IMPORT_REFUSE.empty) {
    return [issue('body', emptyCode, 'Import body is empty — refuse academy.curriculum_empty')];
  }
  if (emptyCode === CURRICULUM_IMPORT_REFUSE.whitespace) {
    return [issue('body', emptyCode, 'Import body is whitespace-only — refuse academy.curriculum_whitespace')];
  }

  const issues: LessonSubstanceIssue[] = [];
  const trimmed = body.trim();

  if (isLengthPaddedJunk(trimmed)) {
    issues.push(
      issue(
        'body',
        CURRICULUM_IMPORT_REFUSE.paddedJunk,
        'Import body is length-padded junk — refuse academy.curriculum_padded_junk (char-count theater)',
      ),
    );
  }

  if (countMarkdownSections(trimmed) < MIN_SECTIONS) {
    issues.push(
      issue(
        'body',
        CURRICULUM_IMPORT_REFUSE.missingSections,
        `Body needs ≥${MIN_SECTIONS} ## sections — refuse academy.curriculum_missing_sections`,
      ),
    );
  }

  if (countInstructionalSteps(trimmed) < MIN_STEPS) {
    issues.push(
      issue(
        'body',
        CURRICULUM_IMPORT_REFUSE.missingSteps,
        `Body needs ≥${MIN_STEPS} instructional steps (list items) — refuse academy.curriculum_missing_steps`,
      ),
    );
  }

  const fromField = normalizeObjectives(extras?.objectives);
  const fromBody = parseObjectivesFromBody(trimmed);
  const objectives = fromField.length >= MIN_OBJECTIVES ? fromField : fromBody;
  if (objectives.length < MIN_OBJECTIVES) {
    issues.push(
      issue(
        'objectives',
        CURRICULUM_IMPORT_REFUSE.missingObjectives,
        `Import needs ≥${MIN_OBJECTIVES} checkable objectives — refuse academy.curriculum_missing_objectives`,
      ),
    );
  }

  return issues;
}

export function lessonSubstanceOk(body: string, extras?: { readonly objectives?: unknown }): boolean {
  return lessonSubstanceChecklist(body, extras).length === 0;
}
