import { describe, expect, it } from 'vitest';
import { completeDrillStep, startPaperDrill, startPaperDrillForCatalogItem } from './workbook-loop.js';

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
});
