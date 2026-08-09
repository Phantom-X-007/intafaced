import { describe, expect, it } from 'vitest';
import {
  CURRICULUM_CONTENT_SOURCE,
  CURRICULUM_TITLE_PLAYBOOKS,
  CURRICULUM_TITLE_WORKBOOKS,
  curriculumInventory,
  curriculumImportStageStatus,
  curriculumImportStageStatusLine,
  validateImportBatch,
  validateImportRecord,
  summarizeImportBatch,
  importBatchRejectedCount,
  importBatchBoardCard,
  importBatchStatusLine,
  importBatchStatusLineIsEmpty,
  importBatchStatusLineDetailed,
  parseImportBatchStatusLine,
  importBatchStatusLineMatches,
  importBatchStatusLineConsistent,
  importBatchExportHeader,
  importBatchExportLine,
  importBatchExportText,
  parseImportBatchExportLine,
  importAcceptedInRange,
  importRejectedAtMost,
  workbookLiveQuoteChecklist,
} from './import-pipeline.js';

const good = {
  slug: 'foundations-sample-drill',
  title: 'Sample drill',
  kind: 'playbook',
  path: 'foundations',
  order: 40,
  summary: 'A real summary for the import pipeline gate.',
  body: `# Sample drill

Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub.

## Worked idea

Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub.

## Mistakes

Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub.`,
};

const goodWorkbook = {
  slug: 'foundations-outline-workbook',
  title: 'Outline workbook',
  kind: 'workbook',
  path: 'foundations',
  order: 50,
  summary: 'Outline drills without inventing live market quotes.',
  body: `# Outline workbook

Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub.

Drill size from invalidation. No fills here. Empty books stay empty.

Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub.

Paper only when the paper market path is on.

Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub. Depth floor requires real teaching prose, not a three-bullet stub.`,
};

describe('curriculumInventory — honest count gate', () => {
  it('names platform-native expansion as the content source on tip', () => {
    expect(CURRICULUM_CONTENT_SOURCE).toBe('platform-native-expansion');
  });

  it('reports spine playbook count honestly against the 20 title promise', () => {
    const inv = curriculumInventory();
    expect(inv.titleTarget).toEqual({ playbooks: CURRICULUM_TITLE_PLAYBOOKS, workbooks: CURRICULUM_TITLE_WORKBOOKS });
    expect(inv.spine.total).toBeGreaterThan(0);
    // Platform-native expansion closed the title counts without licensed invent.
    expect(inv.spine.playbooks).toBe(CURRICULUM_TITLE_PLAYBOOKS);
    expect(inv.spine.workbooks).toBe(CURRICULUM_TITLE_WORKBOOKS);
    expect(inv.residualPlaybooks).toBe(0);
    expect(inv.residualWorkbooks).toBe(0);
    expect(inv.titlePromiseMet).toBe(true);
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

  it('accepts honest outline workbooks and refuses fake live quotes', () => {
    expect(validateImportRecord(goodWorkbook).ok).toBe(true);
    expect(
      validateImportRecord({
        ...goodWorkbook,
        body: '# Bad\n\nLive quote bid: 1.2345 ask: 1.2347 — paint as market.',
      }).ok,
    ).toBe(false);
    expect(
      workbookLiveQuoteChecklist({
        kind: 'workbook',
        title: 'x',
        summary: 'enough summary text here',
        body: '# X\n\ncurrent price: 99.5 on the tape',
      }).length,
    ).toBeGreaterThan(0);
    expect(workbookLiveQuoteChecklist({ ...good, kind: 'playbook' })).toEqual([]);
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

describe('L3 summarizeImportBatch', () => {
  it('counts accepted/rejected without invent', () => {
    const batch = validateImportBatch([good, { ...good, slug: 'BAD SLUG' }]);
    expect(summarizeImportBatch(batch)).toEqual({
      total: 2,
      accepted: 1,
      rejected: 1,
      ok: false,
    });
    expect(summarizeImportBatch(validateImportBatch([]))).toEqual({
      total: 0,
      accepted: 0,
      rejected: 0,
      ok: true,
    });
  });

  it('L3 importBatchRejectedCount from summary', () => {
    expect(importBatchRejectedCount({ total: 2, accepted: 1, rejected: 1, ok: false })).toBe(1);
    expect(importBatchRejectedCount({ total: 0, accepted: 0, rejected: 0, ok: true })).toBe(0);
  });
});

describe('L3 wave47 import-pipeline status/export', () => {
  it('status line matches and consistent', () => {
    const batch = validateImportBatch([good, { slug: 'x' }]);
    const summary = summarizeImportBatch(batch);
    expect(importBatchBoardCard(summary).total).toBe(2);
    expect(importBatchStatusLine(summary)).toBe(`total=${summary.total} accepted=${summary.accepted} rejected=${summary.rejected}`);
    expect(importBatchStatusLineMatches(summary)).toBe(true);
    expect(importBatchStatusLineConsistent(importBatchStatusLine(summary))).toBe(true);
    expect(parseImportBatchStatusLine('nope')).toBeNull();
    expect(importBatchStatusLineDetailed(summary)).toContain('ok=0');
    expect(importBatchStatusLineIsEmpty({ total: 0, accepted: 0, rejected: 0, ok: true })).toBe(true);
  });

  it('export round-trip and range guards', () => {
    const batch = validateImportBatch([good]);
    const summary = summarizeImportBatch(batch);
    const text = importBatchExportText(summary);
    expect(text.startsWith(importBatchExportHeader())).toBe(true);
    expect(parseImportBatchExportLine(importBatchExportLine(summary))).toMatchObject({
      total: 1,
      accepted: 1,
      rejected: 0,
      ok: true,
    });
    expect(parseImportBatchExportLine('bad')).toBeNull();
    expect(importAcceptedInRange(summary, 0, 5)).toBe(true);
    expect(importAcceptedInRange(summary, 5, 0)).toBe(false);
    expect(importRejectedAtMost(summary, 0)).toBe(true);
    expect(importRejectedAtMost(summary, Number.NaN)).toBe(false);
  });
});

describe('Stage-3 curriculumImportStageStatus', () => {
  it('reports pipeline + catalog + polish honestly', () => {
    const status = curriculumImportStageStatus();
    expect(status.stage1Pipeline).toBe(true);
    expect(status.stage2CatalogExpanded).toBe(true);
    expect(status.titlePromiseMet).toBe(true);
    expect(status.stage3Polish.deepLinksVerified).toBe(true);
    expect(status.stage3Polish.i18nStrategyHonest).toBe(true);
    expect(status.stage3Polish.ready).toBe(true);
    expect(curriculumImportStageStatusLine()).toContain('stage3=1');
    expect(curriculumImportStageStatusLine()).toContain('titleMet=1');
  });
});


describe('import body floor matches curriculum depth floor', () => {
  it('refuses a 40-char stub that would have passed the old brandChecklist', async () => {
    const { validateImportRecord } = await import('./import-pipeline.js');
    const { CURRICULUM_MIN_BODY_CHARS } = await import('./catalog.js');
    const stub = {
      slug: 'stub-thin-playbook',
      title: 'Thin stub',
      kind: 'playbook' as const,
      path: 'foundations' as const,
      order: 10,
      summary: 'A summary that is long enough to pass.',
      body: '# Thin\n\nOnly a few lines of body that stay under the depth floor on purpose.',
    };
    expect(stub.body.trim().length).toBeLessThan(CURRICULUM_MIN_BODY_CHARS);
    expect(stub.body.trim().length).toBeGreaterThanOrEqual(40);
    const result = validateImportRecord(stub);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === 'body' && i.message.includes(String(CURRICULUM_MIN_BODY_CHARS)))).toBe(
      true,
    );
  });

  it('accepts a deep body that meets CURRICULUM_MIN_BODY_CHARS', async () => {
    const { validateImportRecord } = await import('./import-pipeline.js');
    const { CURRICULUM_MIN_BODY_CHARS, listCurriculum, getCurriculumItem } = await import('./catalog.js');
    const item = getCurriculumItem(listCurriculum()[0]!.slug)!;
    expect(item.body.length).toBeGreaterThanOrEqual(CURRICULUM_MIN_BODY_CHARS);
    const result = validateImportRecord({
      slug: item.slug,
      title: item.title,
      kind: item.kind,
      path: item.path,
      order: item.order,
      summary: item.summary,
      body: item.body,
    });
    expect(result.ok).toBe(true);
  });
});
