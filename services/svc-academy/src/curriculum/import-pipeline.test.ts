import { describe, expect, it } from 'vitest';
import {
  CURRICULUM_CONTENT_SOURCE,
  CURRICULUM_TITLE_PLAYBOOKS,
  CURRICULUM_TITLE_WORKBOOKS,
  curriculumInventory,
  validateImportBatch,
  validateImportRecord,
} from './import-pipeline.js';

const good = {
  slug: 'foundations-sample-drill',
  title: 'Sample drill',
  kind: 'playbook',
  path: 'foundations',
  order: 40,
  summary: 'A real summary for the import pipeline gate.',
  body: ['# Sample drill', '', 'Body text long enough to clear the honesty floor for Stage-1 imports.'].join('\n'),
};

describe('curriculumInventory — honest count gate', () => {
  it('names platform-native expansion as the content source on tip', () => {
    expect(CURRICULUM_CONTENT_SOURCE).toBe('platform-native-expansion');
  });

  it('reports spine below the 20+3 title promise (residual not painted done)', () => {
    const inv = curriculumInventory();
    expect(inv.titleTarget).toEqual({ playbooks: CURRICULUM_TITLE_PLAYBOOKS, workbooks: CURRICULUM_TITLE_WORKBOOKS });
    expect(inv.spine.total).toBeGreaterThan(0);
    expect(inv.spine.total).toBeLessThan(CURRICULUM_TITLE_PLAYBOOKS + CURRICULUM_TITLE_WORKBOOKS);
    expect(inv.titlePromiseMet).toBe(false);
    expect(inv.residualPlaybooks).toBeGreaterThan(0);
    expect(inv.residualWorkbooks).toBeGreaterThan(0);
  });
});

describe('validateImportRecord', () => {
  it('accepts a clean platform-native record', () => {
    expect(validateImportRecord(good).ok).toBe(true);
  });

  it('refuses bad path / empty body / outbound URL', () => {
    expect(validateImportRecord({ ...good, path: 'moon' }).ok).toBe(false);
    expect(validateImportRecord({ ...good, body: 'short' }).ok).toBe(false);
    expect(validateImportRecord({ ...good, body: '# T\n\nSee https://example.com for more.' }).ok).toBe(false);
  });
});

describe('validateImportBatch', () => {
  it('requires an array and counts accepted', () => {
    expect(validateImportBatch(null).ok).toBe(false);
    const batch = validateImportBatch([good, { ...good, slug: 'BAD SLUG' }]);
    expect(batch.accepted).toBe(1);
    expect(batch.ok).toBe(false);
  });
});
