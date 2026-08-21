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
