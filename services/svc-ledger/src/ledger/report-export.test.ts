import { describe, expect, it } from 'vitest';
import { STATEMENT_LOTS_MISSING } from './statement-pnl.js';
import { handleReportExport } from './report-export.js';

function asJson(value: unknown): string {
  return JSON.stringify(value);
}

describe('CARD G-reporting NAV/SFTP/regulator export completeness', () => {
  it('refuses a complete NAV claim when ownerId is missing', () => {
    const out = handleReportExport({
      kind: 'nav',
      complete: true,
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('completeness_ids_missing');
    expect(out.complete).toBe(false);
    expect(out.missing).toEqual(['ownerId']);
    expect(out.included).toEqual(['reportingPeriod', 'lotIds']);
    expect(asJson(out)).not.toMatch(/"0"/);
    expect(asJson(out)).not.toHaveProperty;
  });

  it('refuses a complete SFTP claim when legalEntityId is missing', () => {
    const out = handleReportExport({
      kind: 'sftp',
      complete: true,
      ownerId: 'owner-1',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('completeness_ids_missing');
    expect(out.missing).toEqual(['legalEntityId']);
    expect(out.included).toContain('ownerId');
    expect(asJson(out)).not.toMatch(/"0"/);
  });

  it('refuses a complete regulator claim when regulatorId is missing', () => {
    const out = handleReportExport({
      kind: 'regulator',
      complete: true,
      ownerId: 'owner-1',
      legalEntityId: 'le-1',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe('completeness_ids_missing');
    expect(out.missing).toEqual(['regulatorId']);
    expect(out.included).toEqual(['ownerId', 'legalEntityId', 'reportingPeriod', 'lotIds']);
  });

  it('keeps the B5 lots_missing refuse when complete and lot ids are absent', () => {
    const out = handleReportExport({
      kind: 'nav',
      complete: true,
      ownerId: 'owner-1',
      reportingPeriod: '2026-Q3',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(STATEMENT_LOTS_MISSING);
    expect(out.missing).toEqual(['lotIds']);
    expect(asJson(out)).not.toMatch(/"0"/);
    expect(asJson(out)).not.toMatch(/nav|realized|unrealized/i);
  });

  it('refuses invented FIFO / history / bare cost basis', () => {
    const fifo = handleReportExport({
      kind: 'nav',
      complete: true,
      ownerId: 'owner-1',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
      inventFifoFromHistory: true,
    });
    const history = handleReportExport({
      kind: 'sftp',
      complete: true,
      ownerId: 'owner-1',
      legalEntityId: 'le-1',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
      lotsFromHistory: true,
    });
    const bare = handleReportExport({
      kind: 'regulator',
      complete: true,
      ownerId: 'owner-1',
      legalEntityId: 'le-1',
      regulatorId: 'sec',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
      costBasis: '12.00',
    });
    expect(fifo.ok).toBe(false);
    expect(history.ok).toBe(false);
    expect(bare.ok).toBe(false);
    if (fifo.ok || history.ok || bare.ok) return;
    expect(fifo.reason).toBe('cost_basis_invented');
    expect(history.reason).toBe('cost_basis_invented');
    expect(bare.reason).toBe('cost_basis_invented');
    expect(asJson(bare)).not.toMatch(/12\.00/);
    expect(asJson(bare)).not.toMatch(/"0"/);
  });

  it('accepts a complete export only when required IDs and lot ids are present — no invented amounts', () => {
    const nav = handleReportExport({
      kind: 'nav',
      complete: true,
      ownerId: 'owner-1',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
    });
    const sftp = handleReportExport({
      kind: 'sftp',
      complete: true,
      ownerId: 'owner-1',
      legalEntityId: 'le-1',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
    });
    const regulator = handleReportExport({
      kind: 'regulator',
      complete: true,
      ownerId: 'owner-1',
      legalEntityId: 'le-1',
      regulatorId: 'sec',
      reportingPeriod: '2026-Q3',
      lotIds: ['lot-1'],
    });
    expect(nav).toEqual({
      ok: true,
      kind: 'nav',
      complete: true,
      included: ['ownerId', 'reportingPeriod', 'lotIds'],
    });
    expect(sftp.ok).toBe(true);
    expect(regulator.ok).toBe(true);
    if (!regulator.ok) return;
    expect(regulator.included).toEqual([
      'ownerId',
      'legalEntityId',
      'regulatorId',
      'reportingPeriod',
      'lotIds',
    ]);
    expect(asJson(nav)).not.toMatch(/"0"/);
    expect(asJson(nav)).not.toMatch(/"nav"|"realized"|"unrealized"|"amount"/);
  });

  it('lists included IDs on a partial export and still invents no money', () => {
    const out = handleReportExport({
      kind: 'regulator',
      ownerId: 'owner-1',
    });
    expect(out).toEqual({
      ok: true,
      kind: 'regulator',
      complete: false,
      included: ['ownerId'],
    });
    expect(asJson(out)).not.toMatch(/"0"/);
  });
});
