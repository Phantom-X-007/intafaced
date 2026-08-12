import { describe, expect, it, vi } from 'vitest';
import { BASE_PERKS, type RankPerks } from '@intafaced/contracts';
import type { HostRightsSource } from '../host-rights.js';
import {
  CERT_PERK_REFUSE_CODE,
  CERT_PERK_RESIDUAL,
  assertNoCertPerkMoneyAttachment,
  certPerkPlaneStatus,
  certPerkPlaneStatusLine,
  certPerkRefuseExportHeader,
  certPerkRefuseExportLine,
  certPerkResidualIsHonest,
  decideCertPerkInvent,
  isCertPerkInventRefuseClosed,
  listCertPerkInventKinds,
  refuseCertToPerkMap,
  refuseInventFeeDiscount,
  refuseInventIfcGrant,
  refuseInventPerkBalance,
  refuseInventPerkMoney,
  resolveCertPerkOutcome,
} from './perk-plane.js';

const perks = (overrides: Partial<RankPerks> = {}): RankPerks => ({ ...BASE_PERKS, ...overrides });

describe('academy.certs D26-P1-C1 perk plane — real or refuse; no fake perk money', () => {
  it('refuses every invent / cert→perk money kind closed', () => {
    for (const d of [
      refuseCertToPerkMap(),
      refuseInventPerkMoney(),
      refuseInventFeeDiscount(),
      refuseInventIfcGrant(),
      refuseInventPerkBalance(),
      decideCertPerkInvent('cert_to_perk_map'),
    ]) {
      expect(d.status).toBe('refuse');
      expect(d.code).toBe(CERT_PERK_REFUSE_CODE);
      expect(d.academyHoldsPerkMoney).toBe(false);
      expect(d.academyMapsCertToPerk).toBe(false);
      expect(isCertPerkInventRefuseClosed(d)).toBe(true);
      expect(d.message).toMatch(/refuse-closed|svc-identity/);
      expect(d.residual).toBe(CERT_PERK_RESIDUAL);
    }
  });

  it('assertNoCertPerkMoneyAttachment allows XP/grant-shaped payloads', () => {
    expect(() =>
      assertNoCertPerkMoneyAttachment({
        certId: 'foundations-v1',
        xpDelta: 100,
        alreadyGranted: false,
      }),
    ).not.toThrow();
    expect(() => assertNoCertPerkMoneyAttachment(null)).not.toThrow();
  });

  it('assertNoCertPerkMoneyAttachment throws on invent perk money fields', () => {
    expect(() => assertNoCertPerkMoneyAttachment({ perkMoney: '10.00' })).toThrow(/refuse-closed|svc-identity/);
    expect(() => assertNoCertPerkMoneyAttachment({ ifcGrant: '1' })).toThrow();
    expect(() => assertNoCertPerkMoneyAttachment({ certPerkMap: { a: 1 } })).toThrow();
    expect(() => assertNoCertPerkMoneyAttachment({ inventedFeeDiscountBps: 50 })).toThrow();
    expect(() => assertNoCertPerkMoneyAttachment({ perkBalance: '0' })).toThrow();
    expect(() => assertNoCertPerkMoneyAttachment({ perkPayout: true })).toThrow();
  });

  it('resolves real perks from identity SoT — never invents a table', async () => {
    const hostRights: HostRightsSource = {
      perksOf: vi.fn(async () => perks({ lobbyHostRights: true, feeDiscountBps: 150 })),
    };
    const outcome = await resolveCertPerkOutcome({
      userId: 'u-1',
      hostRights,
      xp: { emitted: true, idempotencyKey: 'academy.cert:cert:u-1:foundations-v1', xpDelta: 100 },
    });
    expect(outcome).toEqual({
      status: 'real',
      path: 'identity_rank',
      sot: 'svc-identity',
      academyHoldsPerkMoney: false,
      academyMapsCertToPerk: false,
      perks: perks({ lobbyHostRights: true, feeDiscountBps: 150 }),
    });
  });

  it('refuses when identity is unreadable — no fake RankPerks', async () => {
    const hostRights: HostRightsSource = {
      perksOf: vi.fn(async () => {
        throw new Error('identity down');
      }),
    };
    const outcome = await resolveCertPerkOutcome({
      userId: 'u-1',
      hostRights,
      xp: { emitted: false, reason: 'publisher_unavailable' },
    });
    expect(outcome.status).toBe('refuse');
    if (outcome.status !== 'refuse') throw new Error('expected refuse');
    expect(outcome.reason).toBe('identity_unreadable');
    expect(outcome.academyHoldsPerkMoney).toBe(false);
    expect(outcome.academyMapsCertToPerk).toBe(false);
    expect(outcome).not.toHaveProperty('perks');
  });

  it('plane status is honest — identity SoT, no academy perk money', () => {
    const plane = certPerkPlaneStatus();
    expect(plane.perksEnabledViaIdentity).toBe(true);
    expect(plane.academyMapsCertToPerk).toBe(false);
    expect(plane.academyHoldsPerkMoney).toBe(false);
    expect(plane.rankWriter).toBe('svc-identity');
    expect(certPerkResidualIsHonest(plane.residual)).toBe(true);
    expect(plane.statusLine).toBe(certPerkPlaneStatusLine());
    expect(plane.inventKindsRefuseClosed).toEqual([...listCertPerkInventKinds()]);
    expect(certPerkRefuseExportHeader()).toBe('kind,code');
    expect(certPerkRefuseExportLine(refuseInventPerkMoney())).toBe(
      `invent_perk_money,${CERT_PERK_REFUSE_CODE}`,
    );
  });
});
