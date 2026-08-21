/**
 * D26-P1-C5M — academy.curriculum mount vs tracker honest gaps.
 *
 * Platform-native spine substance bar — licensed DERIV//DESK dump Class X.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CURRICULUM_TRACKER_ID = 'academy.curriculum' as const;

export const CURRICULUM_PRODUCT_SYMBOLS = [
  'lessonSubstanceChecklist',
  'substanceBarMet',
  'CURRICULUM_TITLE_PLAYBOOKS',
  'CURRICULUM_CONTENT_SOURCE',
] as const;

export const CURRICULUM_DONE_BAR_TEST_FILES = ['import-pipeline.test.ts', 'lesson-substance.test.ts', 'mount-vs-tracker.test.ts'] as const;

export const CURRICULUM_HONEST_GAPS = ['gap.licensed_deriv_desk_dump', 'gap.full_i18n_spine'] as const;

export function curriculumSymbolsInSource(): readonly (typeof CURRICULUM_PRODUCT_SYMBOLS)[number][] {
  const here = dirname(fileURLToPath(import.meta.url));
  const pipeline = readFileSync(join(here, 'import-pipeline.ts'), 'utf8');
  const substance = readFileSync(join(here, 'lesson-substance.ts'), 'utf8');
  const blob = [pipeline, substance].join('\n');
  return CURRICULUM_PRODUCT_SYMBOLS.filter((name) => new RegExp(`\\b${name}\\b`).test(blob));
}

export function curriculumImportHonestInSource(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, 'import-pipeline.ts'), 'utf8');
  return (
    /licensed-import-pending/.test(src) &&
    /platform-native-expansion/.test(src) &&
    /substanceBarMet/.test(src) &&
    /lessonSubstanceChecklist/.test(src)
  );
}

export function curriculumDoneBarTestsPresent(): boolean {
  const here = dirname(fileURLToPath(import.meta.url));
  return CURRICULUM_DONE_BAR_TEST_FILES.every((file) => existsSync(join(here, file)));
}

export function academyCurriculumTrackerBackendDoneBarMet(): boolean {
  return (
    curriculumSymbolsInSource().length === CURRICULUM_PRODUCT_SYMBOLS.length &&
    curriculumImportHonestInSource() &&
    curriculumDoneBarTestsPresent()
  );
}

export function academyCurriculumMountVsTrackerBoardCard(): {
  readonly tracker: typeof CURRICULUM_TRACKER_ID;
  readonly symbols: number;
  readonly symbolsPresent: number;
  readonly gaps: number;
  readonly backendDoneBarMet: boolean;
} {
  const present = curriculumSymbolsInSource();
  return {
    tracker: CURRICULUM_TRACKER_ID,
    symbols: CURRICULUM_PRODUCT_SYMBOLS.length,
    symbolsPresent: present.length,
    gaps: CURRICULUM_HONEST_GAPS.length,
    backendDoneBarMet: academyCurriculumTrackerBackendDoneBarMet(),
  };
}
