import { describe, expect, it } from 'vitest';
import { MemoryCertStore } from './progress.js';
import { xpIntentFromGrant } from './xp-policy.js';
import { mayPublishXp, toXpEarnedPublish } from './xp-emit.js';

const NOW = new Date('2026-08-05T12:00:00.000Z');

describe('certs L3 xp emit shape', () => {
  it('shapes publish payload from grant intent', () => {
    const store = new MemoryCertStore();
    store.registerCert({ id: 'foundations-v1', title: 'F', requiredItemSlugs: ['a', 'b'] });
    store.markComplete('u1', 'a', NOW);
    store.markComplete('u1', 'b', NOW);
    const intent = xpIntentFromGrant(store.grant('u1', 'foundations-v1', NOW));
    expect(mayPublishXp(intent)).toBe(true);
    if (!intent) return;
    expect(toXpEarnedPublish(intent)).toMatchObject({
      userId: 'u1',
      xpDelta: '100',
      source: 'academy.cert',
      certId: 'foundations-v1',
    });
  });

  it('refuses null intent', () => {
    expect(mayPublishXp(null)).toBe(false);
  });
});
