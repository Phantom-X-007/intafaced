import { describe, expect, it } from 'vitest';
import {
  STATEMENT_LOT_BASIS_MISSING,
  STATEMENT_LOTS_MISSING,
  STATEMENT_MARK_MISSING,
  STATEMENT_NAV_INPUTS_MISSING,
  composeStatementPnl,
  ledgerBookStatementFacts,
  statementPnlFromThisBook,
  type StatementPnlFacts,
  type StatementPnlOwner,
} from './statement-pnl.js';

const OWNER: StatementPnlOwner = {
  ownerType: 'user',
  ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reportingAssetId: 'USDT',
};

function present<T>(value: T): { status: 'present'; value: T } {
  return { status: 'present', value };
}

const absent = { status: 'absent' as const };

describe('composeStatementPnl', () => {
  it('this book has no lots, marks, or NAV inputs — refuses, never 0 PnL', () => {
    const out = statementPnlFromThisBook(OWNER);
    expect(out.status).toBe('refused');
    expect(out.realized).toBeNull();
    expect(out.unrealized).toBeNull();
    expect(out.nav).toBeNull();
    expect(out.codes).toEqual([STATEMENT_LOTS_MISSING, STATEMENT_MARK_MISSING, STATEMENT_NAV_INPUTS_MISSING]);
    expect(JSON.stringify(out)).not.toMatch(/"0"/);
    expect(ledgerBookStatementFacts()).toEqual({ lots: absent, marks: absent, navInputs: absent });
  });

  it('missing lot basis is never treated as 0 cost', () => {
    const facts: StatementPnlFacts = {
      lots: present({
        closed: [{ assetId: 'BTC', costBasis: null, proceeds: '50000' }],
        open: [],
      }),
      marks: present({}),
      navInputs: present({ cashReporting: '100' }),
    };
    const out = composeStatementPnl(OWNER, facts);
    expect(out.status).toBe('refused');
    expect(out.codes).toContain(STATEMENT_LOT_BASIS_MISSING);
    expect(out.realized).toBeNull();
    expect(out.nav).toBeNull();
  });

  it('open lots without a mark refuse — no invented unrealized', () => {
    const facts: StatementPnlFacts = {
      lots: present({
        closed: [],
        open: [{ assetId: 'ETH', qtyRemaining: '2', costBasis: '4000' }],
      }),
      marks: absent,
      navInputs: present({ cashReporting: '10' }),
    };
    const out = composeStatementPnl(OWNER, facts);
    expect(out.status).toBe('refused');
    expect(out.codes).toEqual([STATEMENT_MARK_MISSING]);
    expect(out.unrealized).toBeNull();
  });

  it('missing NAV cash refuses even when lots and marks are complete', () => {
    const facts: StatementPnlFacts = {
      lots: present({
        closed: [{ assetId: 'BTC', costBasis: '20000', proceeds: '25000' }],
        open: [],
      }),
      marks: present({}),
      navInputs: absent,
    };
    const out = composeStatementPnl(OWNER, facts);
    expect(out.status).toBe('refused');
    expect(out.codes).toEqual([STATEMENT_NAV_INPUTS_MISSING]);
    expect(out.nav).toBeNull();
    expect(out.realized).toBeNull();
  });

  it('empty wired lots are empty, not $0 PnL; NAV is cash when supplied', () => {
    const facts: StatementPnlFacts = {
      lots: present({ closed: [], open: [] }),
      marks: present({}),
      navInputs: present({ cashReporting: '12.5' }),
    };
    const out = composeStatementPnl(OWNER, facts);
    expect(out.status).toBe('empty');
    expect(out.realized).toBeNull();
    expect(out.unrealized).toBeNull();
    expect(out.nav).toBe('12.5');
  });

  it('computes realized/unrealized/NAV from decimal strings via scaled bigint', () => {
    const facts: StatementPnlFacts = {
      lots: present({
        closed: [{ assetId: 'BTC', costBasis: '20000', proceeds: '25000' }],
        open: [{ assetId: 'ETH', qtyRemaining: '2', costBasis: '4000' }],
      }),
      marks: present({ ETH: '2500' }),
      navInputs: present({ cashReporting: '100' }),
    };
    const out = composeStatementPnl(OWNER, facts);
    expect(out.status).toBe('ok');
    expect(out.realized).toBe('5000');
    expect(out.unrealized).toBe('1000');
    expect(out.nav).toBe('5100');
    expect(typeof out.realized).toBe('string');
    expect(typeof out.unrealized).toBe('string');
    expect(typeof out.nav).toBe('string');
  });

  it('does not use a JSON number on the result', () => {
    const out = composeStatementPnl(OWNER, {
      lots: present({
        closed: [{ assetId: 'BTC', costBasis: '1.5', proceeds: '1.75' }],
        open: [],
      }),
      marks: present({}),
      navInputs: present({ cashReporting: '0.25' }),
    });
    expect(out.status).toBe('ok');
    if (out.status !== 'ok') throw new Error('expected ok');
    expect(out.realized).toBe('0.25');
    expect(out.nav).toBe('0.25');
    for (const v of [out.realized, out.unrealized, out.nav]) {
      expect(typeof v).toBe('string');
    }
  });
});
