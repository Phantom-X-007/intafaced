import { describe, expect, it } from 'vitest';
import {
  attachPaperFillRef,
  completeDrillStep,
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
});
