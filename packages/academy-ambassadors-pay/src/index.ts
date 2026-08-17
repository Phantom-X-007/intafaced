/**
 * @intafaced/academy-ambassadors-pay — Class M refuse-closed IFC / fee-share gate.
 *
 * No amounts, no default bps, no P&L share, no ledger post until a named
 * ambassador pay export exists (none on tip).
 */
export {
  ACADEMY_AMBASSADOR_SHARE_BPS_ENV,
  AMBASSADOR_PAY_EXPORT_NAMES,
  decideAmbassadorPay,
  findNamedAmbassadorPayExport,
  payout,
  proposePay,
  readOwnerShareBps,
  type AmbassadorPayInput,
  type AmbassadorPayKind,
  type AmbassadorPayRefuse,
  type AmbassadorPayRefuseCode,
  type EnvBag,
  type LedgerPostPort,
  type OwnerShareBps,
} from './pay.js';
