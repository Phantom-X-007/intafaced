import { describe, expect, it } from 'vitest';
import { decideGrant, MemoryCertStore } from './progress.js';
import {
  xpIntentFromGrant,
  xpPolicyFor,
  listXpPolicyCertIds,
  xpDeltaForCert,
  hasXpPolicy,
  xpPolicyCount,
  hasAnyXpPolicy,
  xpPolicyCertIdsJoined,
  hasAtLeastXpPolicies,
  xpPolicyBoardCard,
  xpPolicyExportLines,
  xpPolicyExportHeader,
  xpPolicyExportText,
  parseXpPolicyExportLine,
  countXpPolicyExportDataLines,
  xpPolicyExportHasHeader,
  xpPolicyExportRoundTripOk,
  xpPolicyStatusLine,
  xpPolicyStatusLineIsEmpty,
  xpPolicyStatusLineDetailed,
  parseXpPolicyStatusLine,
  xpPolicyStatusLineMatches,
  xpPolicyStatusLineConsistent,
  xpPolicyCountInRange,
  xpPolicyCatalogConsistent,
  xpPolicyGhostCertIds,
} from './xp-policy.js';
import { listCertCatalog } from './catalog.js';

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

  it('L3 hasXpPolicy false for unknown', () => {
    expect(hasXpPolicy('foundations-v1')).toBe(true);
    expect(hasXpPolicy('nope')).toBe(false);
  });

  it('L3 wave35 xp policy catalog helpers', () => {
    expect(xpPolicyCount()).toBeGreaterThanOrEqual(0);
    expect(typeof hasAnyXpPolicy()).toBe('boolean');
    expect(typeof xpPolicyCertIdsJoined()).toBe('string');
    expect(hasAtLeastXpPolicies(0)).toBe(true);
  });

  it('L3 wave43 xp policy board + export/parse', () => {
    const card = xpPolicyBoardCard();
    expect(card.count).toBe(xpPolicyCount());
    expect(xpPolicyExportHeader()).toBe('certId,xpDelta');
    expect(xpPolicyExportLines().length).toBe(card.count);
    expect(parseXpPolicyExportLine('foundations-v1,100')).toEqual({ certId: 'foundations-v1', xpDelta: '100' });
    expect(parseXpPolicyExportLine('certId,xpDelta')).toBeNull();
    expect(xpPolicyExportText()).toContain('certId,xpDelta');
  });
});

describe('L3 wave48 xp-policy status/export', () => {
  it('export round-trip and status', () => {
    const text = xpPolicyExportText();
    expect(xpPolicyExportHasHeader(text)).toBe(true);
    expect(countXpPolicyExportDataLines(text)).toBe(xpPolicyCount());
    expect(xpPolicyExportRoundTripOk()).toBe(true);
    expect(xpPolicyStatusLineMatches()).toBe(true);
    expect(xpPolicyStatusLineIsEmpty()).toBe(false);
    expect(xpPolicyStatusLineConsistent(xpPolicyStatusLine())).toBe(true);
    expect(parseXpPolicyStatusLine('nope')).toBeNull();
    expect(xpPolicyStatusLineDetailed()).toContain('count=');
    expect(xpPolicyCountInRange(1, 100)).toBe(true);
    expect(xpPolicyCountInRange(100, 1)).toBe(false);
  });
});

describe('XP policy ↔ cert catalog consistency (no ghost priced certs)', () => {
  it('every CERT_XP_V0 certId is grantable from CERT_CATALOG', () => {
    expect(xpPolicyGhostCertIds()).toEqual([]);
    expect(xpPolicyCatalogConsistent()).toBe(true);
    const catalogIds = new Set(listCertCatalog().map((c) => c.id));
    for (const id of listXpPolicyCertIds()) {
      expect(catalogIds.has(id), `ghost policy cert ${id}`).toBe(true);
    }
  });

  it('does not advertise markets-v1 without a catalog definition', () => {
    expect(listXpPolicyCertIds()).not.toContain('markets-v1');
    expect(hasXpPolicy('markets-v1')).toBe(false);
  });
});
