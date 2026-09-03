/**
 * Rulebook refuse (PTX-M00-R04 PTX-M02-R03 PTX-M02-R06 PTX-M02-R08).
 * Emergency actions need authority+evidence or refuse.
 * Corporate / delist without policy refuse. Permissionless listings refuse.
 * Do not invent a listing. Hitch wraps MatchingEngine without recutting engine.ts.
 */
import { MatchingEngine } from './engine.js';
import { operatorRefuse, readOperatorId } from './halt.js';
import type { MarketDelistResult, MarketExpireResult, MarketHaltResult, MarketId, VenueKillResult } from './types.js';

export const MISSING_EVIDENCE = 'missing_evidence' as const;
export const DELIST_POLICY_MISSING = 'delist_policy_missing' as const;
export const CORPORATE_POLICY_MISSING = 'corporate_policy_missing' as const;
export const PERMISSIONLESS_LISTING = 'permissionless_listing' as const;

export const MISSING_EVIDENCE_MESSAGE =
  'emergency action requires authority and evidence; the engine does not invent evidence';
export const DELIST_POLICY_MISSING_MESSAGE =
  'delist requires an owner policy; the engine does not invent a corporate action';
export const CORPORATE_POLICY_MISSING_MESSAGE =
  'corporate action requires an owner policy; the engine does not invent a listing';
export const PERMISSIONLESS_LISTING_MESSAGE =
  'permissionless listings refuse; the engine does not invent a listing';

const FLAG = Symbol.for('intafaced.matching.rulebook-refuse');

export type EvidenceCmd = {
  readonly operatorId?: string | null;
  readonly evidence?: string | null;
  readonly evidenceRefs?: readonly string[] | null;
  readonly policyId?: string | null;
  readonly policyVersion?: string | null;
};

export type ListMarketCmd = {
  readonly marketId?: string | null;
  readonly permissionless?: boolean | null;
  readonly listingPolicy?: string | null;
  readonly listingAuthority?: string | null;
};

export type ListMarketResult = {
  readonly accepted: boolean;
  readonly marketId: string | null;
  readonly listed: boolean;
  readonly rejected?: { readonly code: string; readonly message: string };
};

export type CorporateActionCmd = EvidenceCmd & {
  readonly marketId?: string | null;
  readonly kind?: string | null;
};

function readRequired(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function readEvidence(cmd: EvidenceCmd | null | undefined): readonly string[] | null {
  if (cmd == null) return null;
  const single = readRequired(cmd.evidence ?? null);
  if (single !== null) return [single];
  const refs = cmd.evidenceRefs;
  if (!Array.isArray(refs)) return null;
  const kept = refs.map((row) => readRequired(row)).filter((row): row is string => row !== null);
  return kept.length === 0 ? null : kept;
}

export function readPolicy(cmd: { readonly policyId?: string | null; readonly policyVersion?: string | null } | null | undefined): string | null {
  if (cmd == null) return null;
  return readRequired(cmd.policyId ?? null) ?? readRequired(cmd.policyVersion ?? null);
}

export function readListingPolicy(cmd: ListMarketCmd | null | undefined): string | null {
  if (cmd == null) return null;
  return readRequired(cmd.listingPolicy ?? null) ?? readRequired(cmd.listingAuthority ?? null);
}

export function evidenceRefuse(): { readonly code: typeof MISSING_EVIDENCE; readonly message: string } {
  return { code: MISSING_EVIDENCE, message: MISSING_EVIDENCE_MESSAGE };
}

export function delistPolicyRefuse(): { readonly code: typeof DELIST_POLICY_MISSING; readonly message: string } {
  return { code: DELIST_POLICY_MISSING, message: DELIST_POLICY_MISSING_MESSAGE };
}

export function corporatePolicyRefuse(): { readonly code: typeof CORPORATE_POLICY_MISSING; readonly message: string } {
  return { code: CORPORATE_POLICY_MISSING, message: CORPORATE_POLICY_MISSING_MESSAGE };
}

export function permissionlessListingRefuse(): { readonly code: typeof PERMISSIONLESS_LISTING; readonly message: string } {
  return { code: PERMISSIONLESS_LISTING, message: PERMISSIONLESS_LISTING_MESSAGE };
}

function emergencyGate(cmd: EvidenceCmd | null | undefined): { readonly code: string; readonly message: string } | null {
  const missingOperator = operatorRefuse(readOperatorId(cmd ?? {}));
  if (missingOperator) return missingOperator;
  if (readEvidence(cmd) === null) return evidenceRefuse();
  return null;
}

export function installRulebookRefuse(ctor: typeof MatchingEngine = MatchingEngine): void {
  const proto = ctor.prototype as {
    halt: (marketId: MarketId, cmd: EvidenceCmd) => Promise<MarketHaltResult>;
    haltAll: (cmd: EvidenceCmd) => Promise<VenueKillResult>;
    resume: (marketId: MarketId, cmd: EvidenceCmd) => Promise<MarketHaltResult>;
    resumeAll: (cmd: EvidenceCmd) => Promise<VenueKillResult>;
    expire: (marketId: MarketId, cmd: EvidenceCmd) => Promise<MarketExpireResult>;
    delist: (marketId: MarketId, cmd: EvidenceCmd) => Promise<MarketDelistResult>;
    isHalted: (marketId: MarketId) => boolean;
    isVenueHalted: boolean;
    isExpired: (marketId: MarketId) => boolean;
    isDelisted: (marketId: MarketId) => boolean;
    hasMarket: (marketId: MarketId) => boolean;
    listMarket?: (cmd: ListMarketCmd) => Promise<ListMarketResult>;
    corporateAction?: (cmd: CorporateActionCmd) => Promise<ListMarketResult>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origHalt = proto.halt;
  const origHaltAll = proto.haltAll;
  const origResume = proto.resume;
  const origResumeAll = proto.resumeAll;
  const origExpire = proto.expire;
  const origDelist = proto.delist;

  proto.halt = async function (this: MatchingEngine, marketId: MarketId, cmd: EvidenceCmd) {
    const refused = emergencyGate(cmd);
    if (refused) {
      return {
        accepted: false,
        marketId,
        halted: this.isHalted(marketId),
        operatorId: readOperatorId(cmd),
        rejected: refused,
      };
    }
    return origHalt.call(this, marketId, cmd);
  };

  proto.haltAll = async function (this: MatchingEngine, cmd: EvidenceCmd) {
    const refused = emergencyGate(cmd);
    if (refused) {
      return {
        accepted: false,
        halted: this.isVenueHalted,
        operatorId: readOperatorId(cmd),
        rejected: refused,
      };
    }
    return origHaltAll.call(this, cmd);
  };

  proto.resume = async function (this: MatchingEngine, marketId: MarketId, cmd: EvidenceCmd) {
    const refused = emergencyGate(cmd);
    if (refused) {
      return {
        accepted: false,
        marketId,
        halted: this.isHalted(marketId),
        operatorId: readOperatorId(cmd),
        rejected: refused,
      };
    }
    return origResume.call(this, marketId, cmd);
  };

  proto.resumeAll = async function (this: MatchingEngine, cmd: EvidenceCmd) {
    const refused = emergencyGate(cmd);
    if (refused) {
      return {
        accepted: false,
        halted: this.isVenueHalted,
        operatorId: readOperatorId(cmd),
        rejected: refused,
      };
    }
    return origResumeAll.call(this, cmd);
  };

  proto.expire = async function (this: MatchingEngine, marketId: MarketId, cmd: EvidenceCmd) {
    const refused = emergencyGate(cmd);
    if (refused) {
      return {
        accepted: false,
        marketId,
        expired: this.isExpired(marketId),
        operatorId: readOperatorId(cmd),
        rejected: refused,
      };
    }
    return origExpire.call(this, marketId, cmd);
  };

  proto.delist = async function (this: MatchingEngine, marketId: MarketId, cmd: EvidenceCmd) {
    const missingOperator = operatorRefuse(readOperatorId(cmd));
    if (missingOperator) {
      return {
        accepted: false,
        marketId,
        delisted: this.isDelisted(marketId),
        operatorId: null,
        rejected: missingOperator,
      };
    }
    if (readPolicy(cmd) === null) {
      return {
        accepted: false,
        marketId,
        delisted: this.isDelisted(marketId),
        operatorId: readOperatorId(cmd),
        rejected: delistPolicyRefuse(),
      };
    }
    return origDelist.call(this, marketId, cmd);
  };

  proto.listMarket = async function (this: MatchingEngine, cmd: ListMarketCmd) {
    const marketId = readRequired(cmd?.marketId ?? null);
    const permissionless = cmd?.permissionless === true;
    const policy = readListingPolicy(cmd);
    if (permissionless || policy === null) {
      return {
        accepted: false,
        marketId,
        listed: false,
        rejected: permissionlessListingRefuse(),
      };
    }
    return { accepted: true, marketId, listed: true };
  };

  proto.corporateAction = async function (this: MatchingEngine, cmd: CorporateActionCmd) {
    const marketId = readRequired(cmd?.marketId ?? null);
    const missingOperator = operatorRefuse(readOperatorId(cmd ?? {}));
    if (missingOperator) {
      return { accepted: false, marketId, listed: false, rejected: missingOperator };
    }
    if (readPolicy(cmd) === null) {
      return { accepted: false, marketId, listed: false, rejected: corporatePolicyRefuse() };
    }
    return { accepted: true, marketId, listed: false };
  };
}

try {
  installRulebookRefuse();
} catch {
  queueMicrotask(() => installRulebookRefuse());
}
