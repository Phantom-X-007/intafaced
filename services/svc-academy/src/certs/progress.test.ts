import { describe, expect, it } from 'vitest';
import { CertError, MemoryCertStore, decideGrant, isComplete, progressReport } from './progress.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

const FOUNDATIONS: import('./progress.js').CertDefinition = {
  id: 'foundations-v1',
  title: 'Foundations',
  requiredItemSlugs: ['foundations-intro', 'foundations-risk'],
};

describe('academy.certs Stage-1 progress spine', () => {
  it('isComplete requires every item', () => {
    expect(isComplete(['a', 'b'], new Set(['a']))).toBe(false);
    expect(isComplete(['a', 'b'], new Set(['a', 'b']))).toBe(true);
  });

  it('refuses grant when incomplete', () => {
    expect(() =>
      decideGrant({
        userId: 'u1',
        cert: FOUNDATIONS,
        completedSlugs: new Set(['foundations-intro']),
        existing: null,
        now: NOW,
      }),
    ).toThrow(CertError);
    try {
      decideGrant({
        userId: 'u1',
        cert: FOUNDATIONS,
        completedSlugs: new Set(['foundations-intro']),
        existing: null,
        now: NOW,
      });
    } catch (e) {
      expect((e as CertError).code).toBe('academy.cert_incomplete');
    }
  });

  it('grants when complete; re-grant is idempotent', () => {
    const store = new MemoryCertStore();
    store.registerCert(FOUNDATIONS);
    store.enroll('u1', 'foundations', NOW);
    store.markComplete('u1', 'foundations-intro', NOW);
    store.markComplete('u1', 'foundations-risk', NOW);
    const g1 = store.grant('u1', 'foundations-v1', NOW);
    const g2 = store.grant('u1', 'foundations-v1', new Date('2026-08-06T00:00:00.000Z'));
    expect(g1.idempotencyKey).toBe(g2.idempotencyKey);
    expect(g1.grantedAt.toISOString()).toBe(g2.grantedAt.toISOString());
    expect(store.listCerts('u1')).toHaveLength(1);
  });

  it('re-complete item is no-op (same timestamp)', () => {
    const store = new MemoryCertStore();
    const a = store.markComplete('u1', 'foundations-intro', NOW);
    const b = store.markComplete('u1', 'foundations-intro', new Date('2026-08-06T00:00:00.000Z'));
    expect(a.completedAt.toISOString()).toBe(b.completedAt.toISOString());
  });

  it('unknown cert refuses', () => {
    const store = new MemoryCertStore();
    expect(() => store.grant('u1', 'missing')).toThrow(CertError);
  });

  it('L3 progressReport names missing items; does not invent grant', () => {
    const r = progressReport({
      userId: 'u1',
      cert: FOUNDATIONS,
      completedSlugs: new Set(['foundations-intro']),
      existingGrant: null,
    });
    expect(r.complete).toBe(false);
    expect(r.granted).toBe(false);
    expect(r.missingItemSlugs).toEqual(['foundations-risk']);
    expect(r.ratio).toBe('0.5000');
    expect(r.completedCount).toBe(1);
    expect(r.requiredCount).toBe(2);

    const store = new MemoryCertStore();
    store.registerCert(FOUNDATIONS);
    store.markComplete('u1', 'foundations-intro', NOW);
    store.markComplete('u1', 'foundations-risk', NOW);
    store.grant('u1', 'foundations-v1', NOW);
    const done = store.progressOf('u1', 'foundations-v1');
    expect(done.complete).toBe(true);
    expect(done.granted).toBe(true);
    expect(done.missingItemSlugs).toEqual([]);
    expect(done.ratio).toBe('1.0000');
  });
});
