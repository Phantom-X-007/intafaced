/**
 * @intafaced/execution-house-tenant — §28 sealed house-desk tenancy MECHANISM
 * (D26-P0-01 Stage-1).
 *
 * Separate keys, namespace, audit, kill-switch. No matching-path privilege.
 * Pointing the tenant at our matching book / `kind: 'internal'` refuses with
 * the same `internal_venue` vocabulary as `@intafaced/execution-mm` `refuseInternalMm`.
 * House fills would use `packages/ledger-client` recipes later — this package
 * holds no balances and invents no second book.
 */
export {
  HOUSE_INTERNAL_VENUE_DETAIL,
  SealedHouseTenantRegistry,
  adminKill,
  authorizeTenantVenue,
  isExternalVenueTarget,
  keyNamespaceFor,
  refuseInternalVenue,
  type HouseKeyNamespace,
  type HouseTenant,
  type HouseTenantId,
  type TenantAuditOp,
  type TenantAuditRecord,
  type TenantAuthorizeResult,
  type TenantClear,
  type TenantDescribe,
  type TenantRefuseReason,
  type TenantRefusal,
  type TenantVenueTarget,
} from './house-tenant.js';
export {
  HOUSE_TENANT_BLOCKED_TARGETS,
  HOUSE_TENANT_POLICY_RULING,
  describeHouseTenantPolicy,
  evaluateHouseTenantPolicyGate,
  policyAllowsExternalOnly,
  policyBlocksInternalHalf,
  policyKillSwitchFirst,
  type HouseTenantPolicyGate,
  type HouseTenantPolicySummary,
} from './house-tenant-policy.js';
export {
  HOUSE_MAY_SEE_TENANT_PRIVATE_INTENT,
  TENANT_PRIVATE_INTENT_DETAIL,
  TENANT_PRIVATE_QUOTES_DETAIL,
  TENANT_PRIVATE_RESTING_ORDERS_DETAIL,
  admitHouseMarketPayload,
  houseMayReadMarketView,
  isolateHouseIntentBarrier,
  type HouseIntentBarrierClear,
  type HouseIntentBarrierRefuseReason,
  type HouseIntentBarrierRefusal,
  type HouseIntentBarrierResult,
  type HouseMarketPayload,
  type HouseMarketView,
  type HouseMarketViewKind,
} from './house-intent-barrier.js';
export {
  HOUSE_FILL_MAY_LOOK_LIKE_TENANT,
  HOUSE_MAY_SPEND_TENANT_MONEY,
  LOOKS_LIKE_TENANT_FILL_DETAIL,
  MISSING_TENANT_ID_DETAIL,
  SPEND_TENANT_MONEY_DETAIL,
  houseFillLook,
  isolateHouseVsTenant,
  requireTenantId,
  tenantIdPresent,
  type EconomicBook,
  type HouseExecutionAttribution,
  type HouseFillLook,
  type HouseVsTenantClear,
  type HouseVsTenantRefuseReason,
  type HouseVsTenantRefusal,
  type HouseVsTenantResult,
} from './house-vs-tenant.js';
export {
  HOUSE_TENANT_HONEST_GAPS,
  HOUSE_TENANT_TRACKER_ID,
  houseTenantMountVsTrackerBoardCard,
  houseTenantTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';
