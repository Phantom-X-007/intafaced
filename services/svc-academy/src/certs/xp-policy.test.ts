import { describe, expect, it } from 'vitest';
import { decideGrant, MemoryCertStore } from './progress.js';
import { xpIntentFromGrant, xpPolicyFor, listXpPolicyCertIds, xpDeltaForCert } from './xp-policy.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

describe('academy.certs Stage-2 XP policy (no money)', () => {
  it('maps foundations-v1 to fixed XP string', () => {
    expect(xpPolicyFor('foundations-v1')).toEqual({ certId: 'foundations-v1', xpDelta: '100' });
  });

  it('builds idempotent xp intent from grant', () => {
    const store = new MemoryCertStore();
    store.registerCert({
      id: 'foundations-v1',
      title: 'Foundations',
      requiredItemSlugs: ['a', 'b'],
    });
    store.markComplete('u1', 'a', NOW);
    store.markComplete('u1', 'b', NOW);
    const grant = store.grant('u1', 'foundations-v1', NOW);
    const intent = xpIntentFromGrant(grant);
    expect(intent).toMatchObject({
      userId: 'u1',
      certId: 'foundations-v1',
      xpDelta: '100',
      source: 'academy.cert',
    });
    expect(intent!.idempotencyKey).toBe('academy.cert:cert:u1:foundations-v1');
    // re-grant same intent key
    const grant2 = store.grant('u1', 'foundations-v1', new Date('2026-08-06T00:00:00.000Z'));
    expect(xpIntentFromGrant(grant2)!.idempotencyKey).toBe(intent!.idempotencyKey);
  });

  it('unknown cert policy → null intent (no invent XP)', () => {
    const { grant } = decideGrant({
      userId: 'u1',
      cert: { id: 'unknown-v1', title: 'X', requiredItemSlugs: ['z'] },
      completedSlugs: new Set(['z']),
      existing: null,
      now: NOW,
    });
    expect(xpIntentFromGrant(grant)).toBeNull();
  });

  it('L3 xpDeltaForCert null for unknown; listXpPolicyCertIds sorted', () => {
    expect(xpDeltaForCert('foundations-v1')).toBe('100');
    expect(xpDeltaForCert('no-such-cert')).toBeNull();
    const ids = listXpPolicyCertIds();
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain('foundations-v1');
  });
});
