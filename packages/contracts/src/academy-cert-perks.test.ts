import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_PERKS, type IdentityContract } from './identity.js';
import {
  CERT_PERK_BANNED_PAYLOAD_KEYS,
  CERT_PERK_LAW,
  CERT_PERK_REFUSE_CODE,
  CERT_PERK_RESIDUAL,
  IDENTITY_FORBIDDEN_CERT_PERK_DOORS,
  assertNoCertPerkMoneyAttachment,
  certPerkFromIdentityRead,
  certPerkInventRefuseSchema,
  certPerkLaw,
  certPerkOutcomeSchema,
  certPerkPlaneStatus,
  certPerkPlaneStatusLine,
  certPerkRealSchema,
  certPerkRefuseExportHeader,
  certPerkRefuseExportLine,
  certPerkResidualIsHonest,
  decideCertPerkInvent,
  identitySurfaceLooksLikeCertPerkMap,
  isCertPerkInventRefuseClosed,
  listCertPerkInventKinds,
  refuseCertToPerkMap,
  refuseIdentityUnreadable,
  refuseInventFeeDiscount,
  refuseInventIfcGrant,
  refuseInventPerkBalance,
  refuseInventPerkMoney,
  refuseUnpricedCertPerk,
} from './academy-cert-perks.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('academy cert → identity perk law — refuse-closed, no invent amounts', () => {
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
      expect(certPerkInventRefuseSchema.safeParse(d).success).toBe(true);
      expect(d.message).toMatch(/refuse-closed|svc-identity/);
      expect(d.residual).toBe(CERT_PERK_RESIDUAL);
      expect(d).not.toHaveProperty('perks');
      expect(d).not.toHaveProperty('perkAmount');
      expect(d).not.toHaveProperty('feeDiscountBps');
    }
    expect(listCertPerkInventKinds()).toEqual([...CERT_PERK_LAW.inventKindsRefuseClosed]);
  });

  it('assertNoCertPerkMoneyAttachment allows XP/grant-shaped payloads', () => {
    expect(() =>
      assertNoCertPerkMoneyAttachment({
        certId: 'foundations-v1',
        alreadyGranted: false,
      }),
    ).not.toThrow();
    expect(() => assertNoCertPerkMoneyAttachment(null)).not.toThrow();
  });

  it('assertNoCertPerkMoneyAttachment throws on every banned invent field', () => {
    for (const key of CERT_PERK_BANNED_PAYLOAD_KEYS) {
      expect(() => assertNoCertPerkMoneyAttachment({ [key]: true }), key).toThrow(/refuse-closed|svc-identity/);
    }
  });

  it('real path is identity rank SoT — pass-through of rank.perks, never a cert map', () => {
    const outcome = certPerkFromIdentityRead({ ok: true, perks: BASE_PERKS });
    expect(certPerkRealSchema.safeParse(outcome).success).toBe(true);
    expect(certPerkOutcomeSchema.safeParse(outcome).success).toBe(true);
    expect(outcome).toEqual({
      status: 'real',
      path: 'identity_rank',
      sot: 'svc-identity',
      academyHoldsPerkMoney: false,
      academyMapsCertToPerk: false,
      perks: BASE_PERKS,
    });
  });

  it('refuses when identity is unreadable — no fake RankPerks', () => {
    const outcome = certPerkFromIdentityRead({ ok: false, reason: 'identity_unreadable' });
    expect(outcome).toEqual(refuseIdentityUnreadable());
    expect(outcome.status).toBe('refuse');
    if (outcome.status !== 'refuse') throw new Error('expected refuse');
    expect(outcome.reason).toBe('identity_unreadable');
    expect(outcome.academyHoldsPerkMoney).toBe(false);
    expect(outcome.academyMapsCertToPerk).toBe(false);
    expect(outcome).not.toHaveProperty('perks');
    expect(certPerkOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it('unpriced cert publishes nothing — not a granted perk or perk money', () => {
    const outcome = certPerkFromIdentityRead({ ok: false, reason: 'unpriced' });
    expect(outcome).toEqual(refuseUnpricedCertPerk());
    expect(outcome.status).toBe('refuse');
    if (outcome.status !== 'refuse') throw new Error('expected refuse');
    expect(outcome.reason).toBe('unpriced');
    expect(outcome).not.toHaveProperty('perks');
    expect(outcome.academyHoldsPerkMoney).toBe(false);
    expect(certPerkOutcomeSchema.safeParse(outcome).success).toBe(true);
  });

  it('law board is honest — identity SoT, no academy perk book, no cert→perk map', () => {
    const law = certPerkLaw();
    expect(law.sot).toBe('svc-identity');
    expect(law.perkRead).toBe('rank.perks');
    expect(law.certWrite).toBe('rank.awardXp');
    expect(law.academyMapsCertToPerk).toBe(false);
    expect(law.academyHoldsPerkMoney).toBe(false);
    expect(law.identityAcceptsCertToPerkMap).toBe(false);
    const plane = certPerkPlaneStatus();
    expect(plane.perksEnabledViaIdentity).toBe(true);
    expect(plane.academyMapsCertToPerk).toBe(false);
    expect(plane.academyHoldsPerkMoney).toBe(false);
    expect(plane.rankWriter).toBe('svc-identity');
    expect(certPerkResidualIsHonest(plane.residual)).toBe(true);
    expect(plane.statusLine).toBe(certPerkPlaneStatusLine());
    expect(certPerkRefuseExportHeader()).toBe('kind,code');
    expect(certPerkRefuseExportLine(refuseInventPerkMoney())).toBe(`invent_perk_money,${CERT_PERK_REFUSE_CODE}`);
  });

  it('IdentityContract has no cert→perk door — only rank.awardXp + rank.perks', () => {
    const stub: IdentityContract = {
      rank: {
        get: async () => {
          throw new Error('unused');
        },
        perks: async () => BASE_PERKS,
        awardXp: async () => {
          throw new Error('unused');
        },
      },
      me: async () => {
        throw new Error('unused');
      },
    };
    expect(identitySurfaceLooksLikeCertPerkMap(stub)).toBe(false);
    expect(identitySurfaceLooksLikeCertPerkMap(stub.rank)).toBe(false);
    expect(typeof stub.rank.perks).toBe('function');
    expect(typeof stub.rank.awardXp).toBe('function');
    for (const key of IDENTITY_FORBIDDEN_CERT_PERK_DOORS) {
      expect(key in stub).toBe(false);
      expect(key in stub.rank).toBe(false);
    }
    expect(
      identitySurfaceLooksLikeCertPerkMap({
        certPerk: () => undefined,
      }),
    ).toBe(true);
  });

  it('real schema refuses an invented cert→perk map shaped as RankPerks extras', () => {
    const forged = {
      status: 'real',
      path: 'identity_rank',
      sot: 'svc-identity',
      academyHoldsPerkMoney: false,
      academyMapsCertToPerk: false,
      perks: BASE_PERKS,
      certPerkMap: { 'foundations-v1': BASE_PERKS },
    };
    // Extra keys are stripped by zod object (strip), but the law helper still flags the map door.
    expect(identitySurfaceLooksLikeCertPerkMap(forged)).toBe(true);
    expect(() => assertNoCertPerkMoneyAttachment(forged)).toThrow();
  });
});

describe('academy cert perk law — source scan (no ledger / invent amounts)', () => {
  it('academy-cert-perks.ts never posts ledger or seeds perk amounts', () => {
    const src = readFileSync(join(here, 'academy-cert-perks.ts'), 'utf8');
    const forbidden = [
      { pattern: /\bcreateLedgerClient\b/, why: 'ledger client on cert perk contract' },
      { pattern: /\bLEDGER_URL\b/, why: 'ledger env on cert perk contract' },
      { pattern: /\bCERT_TO_PERK_MAP\b/, why: 'hard-coded cert→perk second opinion' },
      { pattern: /\bperkAmount\s*[:=]/, why: 'invented perk amount field' },
      { pattern: /\bifcGrant\s*[:=]/, why: 'invented IFC grant from cert' },
      { pattern: /\bfeeDiscountBps\s*:\s*\d+/, why: 'invented fee discount amount' },
      { pattern: /\bxpDelta\s*:\s*\d+/, why: 'invented XP amount in product law' },
      { pattern: /\bperkPayout\s*[:=]/, why: 'invented perk payout' },
    ] as const;
    for (const rule of forbidden) {
      expect(src, rule.why).not.toMatch(rule.pattern);
    }
    expect(src).toMatch(/refuse-closed/);
    expect(src).toMatch(/svc-identity/);
    expect(src).toMatch(/academyHoldsPerkMoney: false/);
    expect(src).toMatch(/IdentityContract/);
  });
});
