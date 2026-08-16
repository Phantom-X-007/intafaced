/**
 * Stage-1 fiat-plane fundraising registry (`launch.fundraising`).
 *
 * D26-P0-13: raise economics are owner law. This module records caller-supplied
 * cap and price or it refuses — it never fills either in. On-chain escrow and
 * vesting are out of scope (Shehzad). There is no ledger post on this path.
 */

/** Positive decimal string on the wire — Doctrine §0.6, never a `number`. */
const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

export const RAISE_ECONOMICS_UNSET_CODE = 'launch.raise_economics_unset' as const;
export const CAMPAIGN_NOT_FOUND_CODE = 'launch.campaign_not_found' as const;
export const CHAIN_LEG_REFUSED_CODE = 'launch.chain_leg_refused' as const;

export type FundraisingRefuseCode = typeof RAISE_ECONOMICS_UNSET_CODE | typeof CAMPAIGN_NOT_FOUND_CODE | typeof CHAIN_LEG_REFUSED_CODE;

export class FundraisingError extends Error {
  constructor(
    readonly code: FundraisingRefuseCode,
    message: string,
  ) {
    super(message);
    this.name = 'FundraisingError';
  }
}

export interface CreateCampaignInput {
  readonly ownerUserId: string;
  readonly name: string;
  /** Caller-supplied raise cap. Absent / blank / zero → refuse, never invent. */
  readonly cap?: string | null;
  /** Caller-supplied unit price. Absent / blank / zero → refuse, never invent. */
  readonly price?: string | null;
}

export interface AddMilestoneInput {
  readonly campaignId: string;
  readonly title: string;
  readonly note?: string;
  /**
   * Stage-1 has no chain escrow. Any of these being present is a refuse, not a
   * silent drop — dropping would look like the chain leg was accepted.
   */
  readonly chainTx?: string | null;
  readonly escrowAddress?: string | null;
  readonly vestingContract?: string | null;
}

export interface CampaignRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly cap: string;
  readonly price: string;
  readonly createdAt: string;
}

export interface MilestoneRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly title: string;
  readonly note: string;
  readonly createdAt: string;
}

export interface InvestorRecord {
  readonly userId: string;
  readonly committedAmount: string;
}

export interface InvestorList {
  readonly campaignId: string;
  readonly investors: readonly InvestorRecord[];
  /**
   * Sum of `investors[].committedAmount`. Empty list → `"0"`.
   * Never a separately stored “raised” field that could diverge from the list.
   */
  readonly committedAmount: string;
  readonly committedFrom: 'investor_records';
}

export type CreateCampaignResult =
  | { readonly ok: true; readonly campaign: CampaignRecord }
  | {
      readonly ok: false;
      readonly code: typeof RAISE_ECONOMICS_UNSET_CODE;
      readonly reason: 'unset';
    };

export interface FundraisingRegistry {
  createCampaign(input: CreateCampaignInput): CreateCampaignResult;
  addMilestone(input: AddMilestoneInput): MilestoneRecord;
  listInvestors(campaignId: string): InvestorList;
}

function trim(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * Cap/price are set only when the caller supplied a positive decimal string.
 * Whitespace, missing, `0`, and `0.00` are unset — not a house default.
 */
export function isSetRaiseAmount(value: string | null | undefined): boolean {
  const raw = trim(value);
  if (!raw || !POSITIVE_DECIMAL.test(raw)) return false;
  return /[1-9]/.test(raw);
}

function sumCommitted(investors: readonly InvestorRecord[]): string {
  let scaled = 0n;
  let maxScale = 0;
  for (const row of investors) {
    const [whole = '0', frac = ''] = row.committedAmount.split('.');
    maxScale = Math.max(maxScale, frac.length);
  }
  for (const row of investors) {
    const [whole = '0', frac = ''] = row.committedAmount.split('.');
    const padded = (frac + '0'.repeat(maxScale)).slice(0, maxScale);
    scaled += BigInt(whole + padded);
  }
  if (scaled === 0n) return '0';
  if (maxScale === 0) return scaled.toString();
  const digits = scaled.toString().padStart(maxScale + 1, '0');
  const split = digits.length - maxScale;
  const frac = digits.slice(split).replace(/0+$/, '');
  return frac.length === 0 ? digits.slice(0, split) : `${digits.slice(0, split)}.${frac}`;
}

export class MemoryFundraisingRegistry implements FundraisingRegistry {
  private readonly campaigns = new Map<string, CampaignRecord>();
  private readonly milestones = new Map<string, MilestoneRecord[]>();
  private readonly investors = new Map<string, InvestorRecord[]>();
  private seq = 0;

  createCampaign(input: CreateCampaignInput): CreateCampaignResult {
    if (!isSetRaiseAmount(input.cap) || !isSetRaiseAmount(input.price)) {
      return { ok: false, code: RAISE_ECONOMICS_UNSET_CODE, reason: 'unset' };
    }
    const name = trim(input.name);
    if (!name) {
      return { ok: false, code: RAISE_ECONOMICS_UNSET_CODE, reason: 'unset' };
    }
    this.seq += 1;
    const id = `camp_${this.seq}`;
    const campaign: CampaignRecord = {
      id,
      ownerUserId: input.ownerUserId,
      name,
      cap: trim(input.cap),
      price: trim(input.price),
      createdAt: new Date().toISOString(),
    };
    this.campaigns.set(id, campaign);
    this.milestones.set(id, []);
    this.investors.set(id, []);
    return { ok: true, campaign };
  }

  addMilestone(input: AddMilestoneInput): MilestoneRecord {
    if (trim(input.chainTx) || trim(input.escrowAddress) || trim(input.vestingContract)) {
      throw new FundraisingError(CHAIN_LEG_REFUSED_CODE, 'On-chain escrow/vesting is not this module — fiat-plane milestones only');
    }
    const campaign = this.campaigns.get(input.campaignId);
    if (!campaign) {
      throw new FundraisingError(CAMPAIGN_NOT_FOUND_CODE, 'Campaign not found');
    }
    const title = trim(input.title);
    if (!title) {
      throw new Error('Milestone title is required');
    }
    this.seq += 1;
    const row: MilestoneRecord = {
      id: `ms_${this.seq}`,
      campaignId: campaign.id,
      title,
      note: trim(input.note),
      createdAt: new Date().toISOString(),
    };
    const list = this.milestones.get(campaign.id) ?? [];
    list.push(row);
    this.milestones.set(campaign.id, list);
    return row;
  }

  listInvestors(campaignId: string): InvestorList {
    if (!this.campaigns.has(campaignId)) {
      throw new FundraisingError(CAMPAIGN_NOT_FOUND_CODE, 'Campaign not found');
    }
    const investors = this.investors.get(campaignId) ?? [];
    return {
      campaignId,
      investors,
      committedAmount: sumCommitted(investors),
      committedFrom: 'investor_records',
    };
  }
}
