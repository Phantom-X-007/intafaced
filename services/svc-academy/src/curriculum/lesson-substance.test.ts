import { describe, expect, it } from 'vitest';
import { getCurriculumItem, listCurriculum } from './catalog.js';
import { CURRICULUM_MIN_BODY_CHARS } from './catalog.js';
import { validateImportRecord } from './import-pipeline.js';
import {
  CURRICULUM_IMPORT_REFUSE,
  countInstructionalSteps,
  countMarkdownSections,
  lessonSubstanceChecklist,
} from './lesson-substance.js';

const OBJECTIVES = [
  'State the maximum you are willing to lose on an idea before you look at the entry.',
  'Derive position size from an invalidation level rather than from conviction.',
];

/** Unique prose long enough to clear the char floor without repeating a line. */
function uniqueProse(seed: string): string {
  const clauses = [
    'Risk is chosen before the market decides whether the idea was right.',
    'Size is the arithmetic that keeps an accepted loss from becoming a larger one.',
    'Invalidation is a level that proves the idea wrong, not a feeling after entry.',
    'Leverage changes margin required to hold; it does not change loss over distance.',
    'A daily loss prompt is a brake set before the day it binds.',
    'Empty books stay empty; invented depth is a lie dressed as pedagogy.',
    'Paper practice belongs on the paper market path, never relabelled as live.',
    'Certification and XP belong to the certs surface, not this import bar.',
    'A quote is a moment rather than a promise of a fill at that size.',
    'Guardrails are defaults you may raise, never ignore quietly under pressure.',
  ];
  const parts: string[] = [];
  for (let i = 0; i < 12; i++) {
    parts.push(`${clauses[i % clauses.length]} (${seed} ${i + 1}).`);
  }
  return parts.join(' ');
}

describe('lesson substance named refuses — D26-P1-C5', () => {
  it('refuses empty and whitespace by name', () => {
    expect(lessonSubstanceChecklist('').map((i) => i.code)).toEqual([CURRICULUM_IMPORT_REFUSE.empty]);
    expect(lessonSubstanceChecklist(' \n\t  ').map((i) => i.code)).toEqual([CURRICULUM_IMPORT_REFUSE.whitespace]);
  });

  it('refuses length-padded junk by name even when char floor is cleared', () => {
    const pad = 'Depth floor requires real teaching prose, not a three-bullet stub. '.repeat(20);
    const body = `# Pad\n\n${pad}\n## Section two\n\n${pad}\n## Section three\n\n${pad}`;
    expect(body.trim().length).toBeGreaterThanOrEqual(CURRICULUM_MIN_BODY_CHARS);
    const issues = lessonSubstanceChecklist(body, { objectives: OBJECTIVES });
    expect(issues.some((i) => i.code === CURRICULUM_IMPORT_REFUSE.paddedJunk)).toBe(true);
    expect(validateImportRecord({
      slug: 'pad-junk',
      title: 'Pad junk',
      kind: 'playbook',
      path: 'foundations',
      order: 1,
      summary: 'Summary long enough to pass the twelve character floor.',
      body,
      objectives: OBJECTIVES,
    }).ok).toBe(false);
  });

  it('refuses a long unique wall that lacks ## sections', () => {
    const body = `# Only a title\n\n${uniqueProse('wall')}\n\n${uniqueProse('more')}`;
    expect(countMarkdownSections(body)).toBe(0);
    expect(body.trim().length).toBeGreaterThanOrEqual(CURRICULUM_MIN_BODY_CHARS);
    const issues = lessonSubstanceChecklist(body, { objectives: OBJECTIVES });
    expect(issues.some((i) => i.code === CURRICULUM_IMPORT_REFUSE.missingSections)).toBe(true);
  });

  it('refuses sectioned prose that has no instructional steps', () => {
    const body = `# Title\n\n${uniqueProse('a')}\n\n## Mechanism\n\n${uniqueProse('b')}\n\n## Mistakes\n\n${uniqueProse('c')}`;
    expect(countMarkdownSections(body)).toBeGreaterThanOrEqual(2);
    expect(countInstructionalSteps(body)).toBe(0);
    const issues = lessonSubstanceChecklist(body, { objectives: OBJECTIVES });
    expect(issues.some((i) => i.code === CURRICULUM_IMPORT_REFUSE.missingSteps)).toBe(true);
  });

  it('refuses structured body that still has no objectives', () => {
    const body = `# Title\n\n${uniqueProse('obj')}\n\n## Mechanism\n\n- Size from invalidation, not from conviction on the day.\n- Write the risk fraction before you look at the entry.\n\n## Mistakes\n\n${uniqueProse('obj2')}`;
    const issues = lessonSubstanceChecklist(body);
    expect(issues.some((i) => i.code === CURRICULUM_IMPORT_REFUSE.missingObjectives)).toBe(true);
    expect(validateImportRecord({
      slug: 'no-objectives',
      title: 'No objectives',
      kind: 'lesson',
      path: 'foundations',
      order: 2,
      summary: 'Summary long enough to pass the twelve character floor.',
      body,
    }).ok).toBe(false);
  });

  it('accepts a body with sections, steps, and objectives (field or ## Objectives)', () => {
    const item = getCurriculumItem(listCurriculum()[0]!.slug)!;
    expect(lessonSubstanceChecklist(item.body, { objectives: item.objectives })).toEqual([]);
    const withHeading = `# Drill\n\n${uniqueProse('ok')}\n\n## Objectives\n\n- State the maximum you are willing to lose on an idea first.\n- Derive position size from an invalidation level, not hope.\n\n## Mechanism\n\n- Write the risk fraction before you look at the book.\n- Stop when the daily loss prompt fires, not after.\n\n## Mistakes\n\n${uniqueProse('ok2')}`;
    expect(lessonSubstanceChecklist(withHeading)).toEqual([]);
  });
});
