/**
 * Thin svc-academy consumer for ambassador IFC / fee-share (TRK-academy.ambassadors).
 *
 * Programme / residency / existing IFC refuse stay in sibling files. This file
 * only re-exports `@intafaced/academy-ambassadors-pay` so the package is
 * reachable without touching router / paper / certs / curriculum / spatial.
 *
 * token.staking is already the staked-lobby seat gate (`stakeOf`); this plane
 * does not invent a second pay-stake threshold.
 */
export {
  ACADEMY_AMBASSADOR_SHARE_BPS_ENV,
  decideAmbassadorPay,
  payout,
  proposePay,
  readOwnerShareBps,
  type AmbassadorPayInput,
  type AmbassadorPayRefuse,
  type AmbassadorPayRefuseCode,
} from '@intafaced/academy-ambassadors-pay';
