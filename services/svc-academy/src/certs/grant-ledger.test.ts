import { describe, expect, it, vi } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryCertStore } from './progress.js';
import {
  CERT_GRANT_LEDGER_REFUSE_CODE,
  CERT_GRANT_LEDGER_RESIDUAL,
  CERT_XP_IDENTITY_GRAPH_EVENT,
  assertCertGrantNeverPostsLedger,
  assertCertGrantPathHonest,
  assertMayPublishCertXpOnIdentityGraph,
  assertNoFakeCertPerks,
  certGrantLedgerStatusLine,
  decideCertGrantLedgerPost,
  isAcademyLocalRankWrite,
  isCertGrantLedgerRefuseClosed,
  isIdentityRankXpEvent,
  type CertGrantLedgerPostPort,
} from './grant-ledger.js';
import { BusCertXpPublisher, NullCertXpPublisher } from './xp-publish.js';
import { assertNoCertPerkMoneyAttachment } from './perk-plane.js';

const NOW = new Date('2026-08-17T00:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';

function grantOf() {
  const store = new MemoryCertStore();
  store.registerCert({ id: 'foundations-v1', title: 'Foundations', requiredItemSlugs: ['a', 'b'] });
  store.markComplete(USER, 'a', NOW);
  store.markComplete(USER, 'b', NOW);
  return store.grant(USER, 'foundations-v1', NOW);
}

function spyLedger(): CertGrantLedgerPostPort & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    post: vi.fn((body: unknown) => {
      calls.push(body);
      return { ok: true };
    }),
  };
}

describe('cert grant never posts ledger (TRK-academy.certs)', () => {
  it('decideCertGrantLedgerPost refuses closed and never calls post', () => {
    const ledger = spyLedger();
    const decision = decideCertGrantLedgerPost(grantOf(), { ledger });
    expect(isCertGrantLedgerRefuseClosed(decision)).toBe(true);
    expect(decision.ledgerPosted).toBe(false);
    expect(decision.rankWriter).toBe('svc-identity');
    expect(decision.xpGraph).toBe('intafaced.identity.xp.earned');
    expect(decision.residual).toBe(CERT_GRANT_LEDGER_RESIDUAL);
    expect(ledger.post).not.toHaveBeenCalled();
    expect(ledger.calls).toEqual([]);
  });

  it('throws on ledger post / recipe / IFC amount attachments', () => {
    expect(() => assertCertGrantNeverPostsLedger({ ledgerTxId: 'tx-1' })).toThrow(/ledger money/);
    expect(() => assertCertGrantNeverPostsLedger({ recipes: { certFee: true } })).toThrow();
    expect(() => assertCertGrantNeverPostsLedger({ ifcAmount: '1.00' })).toThrow();
    expect(() => assertCertGrantNeverPostsLedger({ certFee: '10' })).toThrow();
    try {
      assertCertGrantNeverPostsLedger({ ledgerEntryId: 'e1' });
    } catch (err) {
      expect((err as { code?: string }).code).toBe(CERT_GRANT_LEDGER_REFUSE_CODE);
    }
  });

  it('allows a real grant record (no money fields)', () => {
    expect(() => assertCertGrantPathHonest(grantOf())).not.toThrow();
    expect(() => assertCertGrantNeverPostsLedger({ certId: 'foundations-v1', xpDelta: 100 })).not.toThrow();
  });

  it('grantCert input assert also refuses ledger smuggling', () => {
    expect(() => assertNoCertPerkMoneyAttachment({ certId: 'foundations-v1', ledgerTxId: 'tx' })).toThrow(/ledger money|refuse-closed/);
  });
});

describe('XP only via identity rank graph', () => {
  it('names xpEarned as the only cert XP bus event', () => {
    expect(isIdentityRankXpEvent(CERT_XP_IDENTITY_GRAPH_EVENT)).toBe(true);
    expect(isIdentityRankXpEvent('rankUpdated')).toBe(false);
    expect(isAcademyLocalRankWrite('rankUpdated')).toBe(true);
    expect(() => assertMayPublishCertXpOnIdentityGraph('xpEarned')).not.toThrow();
    expect(() => assertMayPublishCertXpOnIdentityGraph('rankUpdated')).toThrow(/rank_state|xpEarned/);
    expect(() => assertMayPublishCertXpOnIdentityGraph('awardXpLocal')).toThrow();
  });

  it('throws on academy-local rank silo fields', () => {
    expect(() => assertCertGrantPathHonest({ rank_state: { rank: 1 } })).toThrow(/ledger money|rank_state/);
    expect(() => assertCertGrantNeverPostsLedger({ academyRank: 3 })).toThrow();
    expect(() => assertCertGrantNeverPostsLedger({ awardXpLocal: 100 })).toThrow();
  });

  it('BusCertXpPublisher publishes xpEarned only and never a ledger post', async () => {
    const ledger = spyLedger();
    const bus = new MemoryEventBus('svc-academy');
    decideCertGrantLedgerPost(grantOf(), { ledger });
    const result = await new BusCertXpPublisher(bus).publishCertXp(grantOf());
    expect(result.emitted).toBe(true);
    expect(bus.emitted('xpEarned')).toHaveLength(1);
    expect(bus.emitted('rankUpdated')).toHaveLength(0);
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('NullCertXpPublisher still does not post ledger when a port is offered', async () => {
    const ledger = spyLedger();
    const decision = decideCertGrantLedgerPost({ certId: 'foundations-v1' }, { ledger });
    expect(decision.ledgerPosted).toBe(false);
    const xp = await new NullCertXpPublisher().publishCertXp(grantOf());
    expect(xp.emitted).toBe(false);
    expect(ledger.post).not.toHaveBeenCalled();
  });
});

describe('no fake perks on the grant path', () => {
  it('refuses cosmetic / claimed perk attachments', () => {
    expect(() => assertNoFakeCertPerks({ fakePerk: true })).toThrow(/Fake|cosmetic/);
    expect(() => assertNoFakeCertPerks({ claimedPerks: ['fee'] })).toThrow();
    expect(() => assertNoFakeCertPerks({ unlockedPerks: { otcAccess: true } })).toThrow();
    expect(() => assertCertGrantPathHonest({ cosmeticPerk: 'metal' })).toThrow();
    expect(() => assertNoCertPerkMoneyAttachment({ certId: 'foundations-v1', inventedPerks: [] })).toThrow();
  });

  it('status line is honest — no ledger, identity graph, no fake perk', () => {
    expect(certGrantLedgerStatusLine()).toBe(
      `grantLedger=0 xpGraph=xpEarned rankWriter=svc-identity fakePerk=0 code=${CERT_GRANT_LEDGER_REFUSE_CODE}`,
    );
  });
});
