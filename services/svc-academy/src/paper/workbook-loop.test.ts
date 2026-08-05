import { describe, expect, it } from 'vitest';
import {
  attachPaperFillRef,
  completeDrillStep,
  drillProgress,
  isDrillComplete,
  completedStepCount,
  remainingStepIds,
  listPaperFillRefs,
  startPaperDrill,
  startPaperDrillForCatalogItem,
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
});
