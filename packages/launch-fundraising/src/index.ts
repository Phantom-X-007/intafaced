/**
 * @intafaced/launch-fundraising — Stage-1 off-chain campaign registry.
 *
 * No ledger, no invented cap/price, no chain escrow.
 */
export {
  CAMPAIGN_NOT_FOUND_CODE,
  CHAIN_LEG_REFUSED_CODE,
  FundraisingError,
  MemoryFundraisingRegistry,
  RAISE_ECONOMICS_UNSET_CODE,
  isSetRaiseAmount,
  type AddMilestoneInput,
  type CampaignRecord,
  type CreateCampaignInput,
  type CreateCampaignResult,
  type FundraisingRefuseCode,
  type FundraisingRegistry,
  type InvestorList,
  type InvestorRecord,
  type MilestoneRecord,
} from './fundraising.js';
