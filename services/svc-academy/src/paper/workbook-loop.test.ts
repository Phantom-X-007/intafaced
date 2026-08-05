import { describe, expect, it } from 'vitest';
import {
  attachPaperFillRef,
  completeDrillStep,
  drillProgress,
  isDrillComplete,
  completedStepCount,
  fillRefCount,
  remainingStepIds,
  isDrillRefused,
  remainingStepCount,
  totalStepCount,
  isDrillInProgress,
  listPaperFillRefs,
  startPaperDrill,
  startPaperDrillForCatalogItem,
  isDrillStatusComplete,
  isDrillStatusActive,
  drillCompletionRatio,
  drillMarketId,
  hasNoFillRefs,
  drillSymbol,
  drillWorkbookSlug,
  hasPartialProgress,
  hasFillRefs,
  firstRemainingStepId,
  lastRemainingStepId,
  drillCompletionRatioNumber,
  firstCompletedStepId,
  lastCompletedStepId,
  hasNoRemainingSteps,
  isStepListEmpty,
  isDrillUntouched,
  isDrillFullyRatioed,
  drillCompletionPercent,
  remainingStepRatio,
  totalStepCountLabel,
  completedStepCountLabel,
  remainingStepCountLabel,
  fillRefCountLabel,
  remainingStepIdsJoined,
  completedStepIdsJoined,
  drillStatusLabel,
  drillRatioLabel,
  drillMarketIdLabel,
  drillSymbolLabel,
  drillWorkbookSlugLabel,
  drillCompletionPercentLabel,
  drillProgressSnapshot,
  drillStepCountsConsistent,
  drillIdentitySnapshot,
  isFreshActiveDrill,
  drillBoardCard,
  drillStepBar,
  drillCardIsRefused,
  drillCardIsFresh,
  filterRemainingStepIds,
  filterCompletedStepIds,
  remainingStepsMatch,
  completedStepsMatch,
  pageRemainingStepIds,
  pageCompletedStepIds,
  remainingStepsPageCount,
  reverseRemainingStepIds,
  remainingStepsOnlyLeft,
  completedStepsOnlyLeft,
  drillPercentDelta,
  drillsSameStatus,
} from './workbook-loop.js';

describe('paper Stage-2 workbook loop', () => {
  it('refuses live market — fail closed', () => {
    const r = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm1', paper: false, symbol: 'BTC/USDT' },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('not_paper');
  });

  it('refuses missing market', () => {
    const r = startPaperDrill({ workbookSlug: 'foundations-paper-workbook', market: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('no_market');
  });

  it('completes steps idempotently on paper market', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    let run = start.run;
    expect(run.fillRefs).toEqual([]);
    for (const step of run.steps) {
      const next = completeDrillStep(run, step.id);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      run = next.run;
      const again = completeDrillStep(run, step.id);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.run.completedStepIds.filter((id) => id === step.id)).toHaveLength(1);
    }
    expect(run.status).toBe('complete');
  });

  it('unknown step refuses invent progress', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    if (!start.ok) return;
    const r = completeDrillStep(start.run, 'not-a-step');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('unknown_step');
  });

  it('refuses non-workbook catalog kinds', () => {
    const r = startPaperDrillForCatalogItem({
      slug: 'foundations-risk-first',
      kind: 'playbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    expect(r.ok).toBe(false);
  });

  it('attachPaperFillRef accepts trade fill ids only — no invent empty', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    if (!start.ok) return;
    const bad = attachPaperFillRef(start.run, { fillId: '  ', marketId: 'p1' });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.reason).toBe('bad_fill');

    const mismatch = attachPaperFillRef(start.run, { fillId: 'f-1', marketId: 'other' });
    expect(mismatch.ok).toBe(false);

    const ok = attachPaperFillRef(start.run, { fillId: 'f-1', marketId: 'p1' });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(listPaperFillRefs(ok.run).map((f) => f.fillId)).toEqual(['f-1']);
    const again = attachPaperFillRef(ok.run, { fillId: 'f-1', marketId: 'p1' });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.run.fillRefs).toHaveLength(1);
    // type has no amount/price — money stays on trade
    expect(listPaperFillRefs(ok.run)[0]).not.toHaveProperty('amount');
    expect(listPaperFillRefs(ok.run)[0]).not.toHaveProperty('price');
  });

  it('L3 drillProgress reports ratio without invent complete', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    if (!start.ok) return;
    const p0 = drillProgress(start.run);
    expect(p0.completedCount).toBe(0);
    expect(p0.ratio).toBe('0.0000');
    const step = start.run.steps[0]!;
    const next = completeDrillStep(start.run, step.id);
    if (!next.ok) return;
    const p1 = drillProgress(next.run);
    expect(p1.completedCount).toBe(1);
    expect(Number(p1.ratio)).toBeGreaterThan(0);
    expect(p1.status).toBe('active');
  });

  it('L3 remainingStepIds + isDrillComplete without invent steps', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    if (!start.ok) return;
    expect(remainingStepIds(start.run).length).toBe(start.run.steps.length);
    expect(isDrillComplete(start.run)).toBe(false);
    let run = start.run;
    for (const step of start.run.steps) {
      const next = completeDrillStep(run, step.id);
      if (!next.ok) return;
      run = next.run;
    }
    expect(remainingStepIds(run)).toEqual([]);
    expect(isDrillComplete(run)).toBe(true);
  });

  it('L3 completedStepCount tracks progress without invent', () => {
    const start = startPaperDrill({
      workbookSlug: 'wb',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
      steps: [
        { id: 's1', instruction: 'one' },
        { id: 's2', instruction: 'two' },
      ],
    });
    if (!start.ok) throw new Error('expected ok');
    expect(completedStepCount(start.run)).toBe(0);
    const mid = completeDrillStep(start.run, 's1');
    if (!mid.ok) throw new Error('expected ok');
    expect(completedStepCount(mid.run)).toBe(1);
  });

  it('L3 fillRefCount zero without invent', () => {
    const start = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'p1', paper: true, symbol: 'PAPER/USD' },
    });
    if (!start.ok) return;
    expect(fillRefCount(start.run)).toBe(0);
  });

  it('L3 wave25 refused/progress step counts', () => {
    const refused = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm1', paper: false, symbol: 'BTC/USDT' },
    });
    expect(refused.ok).toBe(false);
    // build an open run
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm1', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(isDrillRefused(started.run)).toBe(false);
    expect(totalStepCount(started.run)).toBe(started.run.steps.length);
    expect(remainingStepCount(started.run)).toBe(started.run.steps.length);
    expect(isDrillInProgress(started.run)).toBe(true);
  });

  it('L3 wave26 status flags + completion ratio + market id', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w26', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(isDrillStatusActive(started.run)).toBe(true);
    expect(isDrillStatusComplete(started.run)).toBe(false);
    expect(drillCompletionRatio(started.run)).toBe('0.0000');
    expect(drillMarketId(started.run)).toBe('m-w26');
  });

  it('L3 wave27 fill refs + symbol + slug + partial progress', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w27', paper: true, symbol: 'ETH/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(hasNoFillRefs(started.run)).toBe(true);
    expect(drillSymbol(started.run)).toBe('ETH/USDT');
    expect(drillWorkbookSlug(started.run)).toBe('foundations-paper-workbook');
    expect(hasPartialProgress(started.run)).toBe(false);
    const step = started.run.steps[0]!.id;
    const mid = completeDrillStep(started.run, step);
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;
    expect(hasPartialProgress(mid.run)).toBe(true);
  });

  it('L3 wave28 fill refs + remaining ends + ratio number', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w28', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(hasFillRefs(started.run)).toBe(false);
    expect(firstRemainingStepId(started.run)).toBe(started.run.steps[0]!.id);
    expect(lastRemainingStepId(started.run)).toBe(started.run.steps[started.run.steps.length - 1]!.id);
    expect(drillCompletionRatioNumber(started.run)).toBe(0);
  });

  it('L3 wave29 completed ends + remaining empty + step list', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w29', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(firstCompletedStepId(started.run)).toBeNull();
    expect(lastCompletedStepId(started.run)).toBeNull();
    expect(hasNoRemainingSteps(started.run)).toBe(false);
    expect(isStepListEmpty(started.run)).toBe(false);
    const step = started.run.steps[0]!.id;
    const mid = completeDrillStep(started.run, step);
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;
    expect(firstCompletedStepId(mid.run)).toBe(step);
    expect(lastCompletedStepId(mid.run)).toBe(step);
  });

  it('L3 wave30 untouched + percent + remaining ratio', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w30', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(isDrillUntouched(started.run)).toBe(true);
    expect(isDrillFullyRatioed(started.run)).toBe(false);
    expect(drillCompletionPercent(started.run)).toBe(0);
    expect(remainingStepRatio(started.run)).toBe('1.0000');
  });

  it('L3 wave31 step/fill count labels', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w31', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(totalStepCountLabel(started.run)).toBe(String(started.run.steps.length));
    expect(completedStepCountLabel(started.run)).toBe('0');
    expect(remainingStepCountLabel(started.run)).toBe(String(started.run.steps.length));
    expect(fillRefCountLabel(started.run)).toBe('0');
  });

  it('L3 wave32 step joins + status/ratio labels', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w32', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(remainingStepIdsJoined(started.run).split(',').filter(Boolean).length).toBe(started.run.steps.length);
    expect(completedStepIdsJoined(started.run)).toBe('');
    expect(drillStatusLabel(started.run)).toBe('active');
    expect(drillRatioLabel(started.run)).toBe('0.0000');
  });

  it('L3 wave33 drill identity labels', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w33', paper: true, symbol: 'SOL/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(drillMarketIdLabel(started.run)).toBe('m-w33');
    expect(drillSymbolLabel(started.run)).toBe('SOL/USDT');
    expect(drillWorkbookSlugLabel(started.run)).toBe('foundations-paper-workbook');
    expect(drillCompletionPercentLabel(started.run)).toBe('0');
  });

  it('L3 wave34 drill snapshots + fresh active', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w34', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(drillProgressSnapshot(started.run).percent).toBe(0);
    expect(drillStepCountsConsistent(started.run)).toBe(true);
    expect(drillIdentitySnapshot(started.run).marketId).toBe('m-w34');
    expect(isFreshActiveDrill(started.run)).toBe(true);
  });

  it('L3 wave36 drill board card + step bar', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w36', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(drillBoardCard(started.run).fresh).toBe(true);
    expect(drillCardIsFresh(started.run)).toBe(true);
    expect(drillCardIsRefused(started.run)).toBe(false);
    expect(drillStepBar(started.run).percent).toBe(0);
  });

  it('L3 wave37 drill step filter/match', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w37', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(filterRemainingStepIds(started.run, '')).toEqual([]);
    expect(remainingStepsMatch(started.run, 'size')).toBe(true);
    expect(completedStepsMatch(started.run, 'size')).toBe(false);
    const step = started.run.steps[0]!.id;
    const mid = completeDrillStep(started.run, step);
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;
    expect(filterCompletedStepIds(mid.run, step.slice(0, 3))).toContain(step);
  });

  it('L3 wave38 drill step paging', () => {
    const started = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w38', paper: true, symbol: 'BTC/USDT' },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(pageRemainingStepIds(started.run, { offset: 0, limit: 1 })).toHaveLength(1);
    expect(remainingStepsPageCount(started.run, 1)).toBe(started.run.steps.length);
    expect(reverseRemainingStepIds(started.run)[0]).toBe(started.run.steps[started.run.steps.length - 1]!.id);
    expect(pageCompletedStepIds(started.run, { limit: 5 })).toEqual([]);
  });

  it('L3 wave39 drill compare', () => {
    const a = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w39a', paper: true, symbol: 'BTC/USDT' },
    });
    const b = startPaperDrill({
      workbookSlug: 'foundations-paper-workbook',
      market: { marketId: 'm-w39b', paper: true, symbol: 'ETH/USDT' },
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(drillsSameStatus(a.run, b.run)).toBe(true);
    expect(drillPercentDelta(a.run, b.run)).toBe(0);
    const step = a.run.steps[0]!.id;
    const a2 = completeDrillStep(a.run, step);
    expect(a2.ok).toBe(true);
    if (!a2.ok) return;
    expect(completedStepsOnlyLeft(a2.run, b.run)).toContain(step);
    expect(remainingStepsOnlyLeft(b.run, a2.run)).toContain(step);
  });
});
