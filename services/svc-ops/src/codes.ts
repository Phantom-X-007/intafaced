/** Machine-readable refuses. The code leads the tRPC message so IxState can quote it. */
export const OPS_WAREHOUSE_UNWIRED = 'ops.warehouse_unwired' as const;
export const OPS_WAREHOUSE_LAG_UNKNOWN = 'ops.warehouse_lag_unknown' as const;
export const OPS_WAREHOUSE_LAG_STALE = 'ops.warehouse_lag_stale' as const;
export const OPS_PAYROLL_INVENT_FORBIDDEN = 'ops.payroll_invent_forbidden' as const;
export const OPS_IDENTITY_UNWIRED = 'ops.identity_unwired' as const;
export const OPS_SUPPORT_UNWIRED = 'ops.support_unwired' as const;
export const OPS_CONTACT_REQUIRED = 'ops.contact_required' as const;
export const OPS_PROJECT_REQUIRED = 'ops.project_required' as const;
export const OPS_TEAM_HANDLE_REQUIRED = 'ops.team_handle_required' as const;
export const OPS_RAISE_NAME_REQUIRED = 'ops.raise_name_required' as const;
export const OPS_FUNDRAISING_AMOUNT_INVALID = 'ops.fundraising_amount_invalid' as const;
export const OPS_FUNDRAISING_CHAIN_UNWIRED = 'ops.fundraising_chain_unwired' as const;
export const OPS_STRUCTURED_OWNER_PRICE_REQUIRED = 'ops.structured_owner_price_required' as const;
export const OPS_STRUCTURED_PRICE_FORBIDDEN = 'ops.structured_price_forbidden' as const;
export const OPS_CUSTODY_WRAP_UNSET = 'ops.custody_wrap_unset' as const;
export const OPS_CUSTODY_CHAIN_UNWIRED = 'ops.custody_chain_unwired' as const;
export const OPS_CUSTODY_KEYS_FORBIDDEN = 'ops.custody_keys_forbidden' as const;
export const OPS_CUSTODY_TIER_REQUIRED = 'ops.custody_tier_required' as const;
export const OPS_CUSTODY_AMOUNT_INVALID = 'ops.custody_amount_invalid' as const;
export const OPS_CUSTODY_FREEZE_UNSET = 'ops.custody_freeze_unset' as const;
export const OPS_CUSTODY_FROZEN = 'ops.custody_frozen' as const;

export type OpsRefuseCode =
  | typeof OPS_WAREHOUSE_UNWIRED
  | typeof OPS_WAREHOUSE_LAG_UNKNOWN
  | typeof OPS_WAREHOUSE_LAG_STALE
  | typeof OPS_PAYROLL_INVENT_FORBIDDEN
  | typeof OPS_IDENTITY_UNWIRED
  | typeof OPS_SUPPORT_UNWIRED
  | typeof OPS_CONTACT_REQUIRED
  | typeof OPS_PROJECT_REQUIRED
  | typeof OPS_TEAM_HANDLE_REQUIRED
  | typeof OPS_RAISE_NAME_REQUIRED
  | typeof OPS_FUNDRAISING_AMOUNT_INVALID
  | typeof OPS_FUNDRAISING_CHAIN_UNWIRED
  | typeof OPS_STRUCTURED_OWNER_PRICE_REQUIRED
  | typeof OPS_STRUCTURED_PRICE_FORBIDDEN
  | typeof OPS_CUSTODY_WRAP_UNSET
  | typeof OPS_CUSTODY_CHAIN_UNWIRED
  | typeof OPS_CUSTODY_KEYS_FORBIDDEN
  | typeof OPS_CUSTODY_TIER_REQUIRED
  | typeof OPS_CUSTODY_AMOUNT_INVALID
  | typeof OPS_CUSTODY_FREEZE_UNSET
  | typeof OPS_CUSTODY_FROZEN;

export class OpsError extends Error {
  readonly code: OpsRefuseCode;

  constructor(code: OpsRefuseCode, message: string) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
  }
}
