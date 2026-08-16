import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MemoryCertStore, type CertDefinition } from '../certs/progress.js';
import { assertPaperNeverReadableAsRealMoney } from './real-money-ban.js';
import { completeDrillStep, startPaperDrill, type DrillRun } from './workbook-loop.js';
import { recordPaperCertItemProgress } from './cert-progress-hook.js';

const NOW = new Date('2026-08-16T12:00:00.000Z');
const PAPER = { marketId: 'mkt-paper-1', paper: true as const, symbol: 'BTC-USDT' };

const BOUND_CERT: CertDefinition = {
  id: 'foundations-v1',
  title: 'Foundations',
  requiredItemSlugs: ['foundations-paper-workbook'],
};

function completeRun(workbookSlug: string): DrillRun {
  const started = startPaperDrill({ workbookSlug, market: PAPER });
  if (!started.ok) throw new Error(started.message);
  let run = started.run;
  for (const step of run.steps) {
    const next = completeDrillStep(run, step.id);
    if (!next.ok) throw new Error(next.message);
    run = next.run;
  }
  return run;
}

describe('paper sealed drill → cert item completion (no XP invent, no grantCert)', () => {
  it('bound workbook records a completion row and never calls grantCert', () => {
    const store = new MemoryCertStore();
    store.registerCert(BOUND_CERT);
    const grantCert = vi.fn();
    const persist = vi.fn((record: { userId: string; itemSlug: string }) => {
      store.markComplete(record.userId, record.itemSlug, NOW);
    });

    const view = recordPaperCertItemProgress({
      userId: 'u-paper-1',
      run: completeRun('foundations-paper-workbook'),
      certs: [BOUND_CERT],
      existing: null,
      persist,
      spies: { grantCert },
      now: NOW,
    });

    expect(view).toMatchObject({
      simulated: true,
      realMoney: false,
      progress: 'recorded',
      certId: 'foundations-v1',
      itemSlug: 'foundations-paper-workbook',
      alreadyComplete: false,
      grantCert: false,
      perkMap: false,
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(store.listCompletedItemSlugs('u-paper-1')).toEqual(['foundations-paper-workbook']);
    expect(store.listGrantedCertIds('u-paper-1')).toEqual([]);
    expect(grantCert).not.toHaveBeenCalled();
    expect(() => assertPaperNeverReadableAsRealMoney(view)).not.toThrow();
  });

  it('unbound workbook is named unbound — no persist, no grantCert', () => {
    const store = new MemoryCertStore();
    store.registerCert(BOUND_CERT);
    const grantCert = vi.fn();
    const persist = vi.fn();

    const view = recordPaperCertItemProgress({
      userId: 'u-paper-1',
      run: completeRun('unbound-paper-workbook'),
      certs: [BOUND_CERT],
      existing: null,
      persist,
      spies: { grantCert },
      now: NOW,
    });

    expect(view).toEqual({
      simulated: true,
      realMoney: false,
      progress: 'unbound',
      reason: 'academy.paper_cert_unbound',
      itemSlug: 'unbound-paper-workbook',
      grantCert: false,
      perkMap: false,
    });
    expect(persist).not.toHaveBeenCalled();
    expect(store.listCompletedItemSlugs('u-paper-1')).toEqual([]);
    expect(store.listGrantedCertIds('u-paper-1')).toEqual([]);
    expect(grantCert).not.toHaveBeenCalled();
    expect(() => assertPaperNeverReadableAsRealMoney(view)).not.toThrow();
  });

  it('incomplete drill does not record a completion row', () => {
    const started = startPaperDrill({ workbookSlug: 'foundations-paper-workbook', market: PAPER });
    if (!started.ok) throw new Error(started.message);
    const grantCert = vi.fn();
    const persist = vi.fn();

    const view = recordPaperCertItemProgress({
      userId: 'u-paper-1',
      run: started.run,
      certs: [BOUND_CERT],
      existing: null,
      persist,
      spies: { grantCert },
    });

    expect(view.progress).toBe('incomplete');
    expect(persist).not.toHaveBeenCalled();
    expect(grantCert).not.toHaveBeenCalled();
    expect(() => assertPaperNeverReadableAsRealMoney(view)).not.toThrow();
  });

  it('does not import perk map, XP invent, or ledger write surface', () => {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const text = readFileSync(join(here, 'cert-progress-hook.ts'), 'utf8');
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/perk-plane/);
    expect(code).not.toMatch(/xp-publish|xp-policy|xp-emit/);
    expect(code).not.toMatch(/LedgerClient|recipes|MemoryLedger/);
    expect(code).not.toMatch(/\.grant\s*\(/);
  });
});
