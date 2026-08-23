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
  | typeof OPS_FUNDRAISING_CHAIN_UNWIRED;

export class OpsError extends Error {
  readonly code: OpsRefuseCode;

  constructor(code: OpsRefuseCode, message: string) {
    super(message);
    this.name = 'OpsError';
    this.code = code;
  }
}
