import { describe, expect, it } from 'vitest';
import {
  ADAPTER_IS_NOT_BOOK,
  BREAK_AUTO_CLEAR_REFUSED,
  CUSTODY_AMOUNTS_MISSING,
  OFF_EXCHANGE_OWNER_UNSET,
  handleCustody,
} from './custody-adapters.js';

describe('CARD G-custody adapters, aging breaks, off-exchange OWNER', () => {
  it('keeps a chain adapter as an adapter, never the book', () => {
    const out = handleCustody({
      kind: 'chain',
      treatAsBook: true,
      adapterAmount: '12.5',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(ADAPTER_IS_NOT_BOOK);
    expect(out.role).toBe('adapter');
    expect(out.kind).toBe('chain');
  });

  it('keeps a fiat adapter as an adapter when role is claimed as book', () => {
    const out = handleCustody({
      kind: 'fiat',
      role: 'book',
      adapterAmount: '80',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(ADAPTER_IS_NOT_BOOK);
    expect(out.role).toBe('adapter');
  });

  it('observes a chain adapter amount as a string and does not post', () => {
    const out = handleCustody({
      kind: 'chain',
      role: 'adapter',
      adapterAmount: '12.50',
    });
    expect(out).toEqual({
      ok: true,
      kind: 'chain',
      role: 'adapter',
      observed: '12.5',
    });
  });

  it('refuses a missing adapter observation rather than inventing 0', () => {
    const out = handleCustody({ kind: 'fiat', role: 'adapter' });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(CUSTODY_AMOUNTS_MISSING);
    expect(JSON.stringify(out)).not.toMatch(/"observed":"0"/);
  });

  it('refuses off-exchange custody until OWNER authorizes the product', () => {
    const unset = handleCustody({ kind: 'off_exchange' });
    expect(unset.ok).toBe(false);
    if (unset.ok) return;
    expect(unset.reason).toBe(OFF_EXCHANGE_OWNER_UNSET);
    expect(JSON.stringify(unset)).not.toMatch(/"observed"/);
  });

  it('ages an open break and refuses auto-clear', () => {
    const aged = handleCustody({
      kind: 'break',
      breakId: 'brk-1',
      adapterAmount: '12',
      bookAmount: '10',
      firstSeenAt: '2026-09-01T00:00:00.000Z',
      now: '2026-09-02T00:00:00.000Z',
    });
    expect(aged.ok).toBe(true);
    if (!aged.ok || aged.kind !== 'break') return;
    expect(aged.status).toBe('open');
    expect(aged.ageMs).toBe(86_400_000);
    expect(aged.difference).toBe('2');

    const auto = handleCustody({
      kind: 'break',
      breakId: 'brk-1',
      adapterAmount: '10',
      bookAmount: '10',
      firstSeenAt: '2026-09-01T00:00:00.000Z',
      now: '2026-09-03T00:00:00.000Z',
      autoClear: true,
    });
    expect(auto.ok).toBe(false);
    if (auto.ok) return;
    expect(auto.reason).toBe(BREAK_AUTO_CLEAR_REFUSED);
    expect(auto.ageMs).toBe(172_800_000);
    expect(auto.breakId).toBe('brk-1');
  });

  it('refuses resolve=auto even when amounts later match', () => {
    const out = handleCustody({
      kind: 'break',
      breakId: 'brk-2',
      adapterAmount: '7',
      bookAmount: '7',
      firstSeenAt: '2026-08-01T00:00:00.000Z',
      now: '2026-09-01T00:00:00.000Z',
      resolve: 'auto',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(BREAK_AUTO_CLEAR_REFUSED);
    expect(out.ageMs).toBeGreaterThan(0);
  });

  it('lets an operator resolve a break and still reports the difference as a string', () => {
    const out = handleCustody({
      kind: 'break',
      breakId: 'brk-3',
      adapterAmount: '5',
      bookAmount: '5',
      firstSeenAt: '2026-09-01T00:00:00.000Z',
      now: '2026-09-01T01:00:00.000Z',
      resolve: 'operator',
    });
    expect(out).toMatchObject({
      ok: true,
      kind: 'break',
      status: 'resolved',
      ageMs: 3_600_000,
      breakId: 'brk-3',
      difference: '0',
    });
    if (!out.ok || out.kind !== 'break') return;
    expect(typeof out.difference).toBe('string');
  });

  it('refuses a break with missing amounts rather than healing it to 0', () => {
    const out = handleCustody({
      kind: 'break',
      breakId: 'brk-4',
      firstSeenAt: '2026-09-01T00:00:00.000Z',
      now: '2026-09-01T00:10:00.000Z',
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toBe(CUSTODY_AMOUNTS_MISSING);
    expect(out.ageMs).toBe(600_000);
    expect(JSON.stringify(out)).not.toMatch(/"difference":"0"/);
  });
});
