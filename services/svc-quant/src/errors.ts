export const QUANT_SANDBOX_UNWIRED = 'quant.sandbox_unwired' as const;
export const QUANT_SANDBOX_ESCAPE = 'quant.sandbox_escape' as const;
export const QUANT_SANDBOX_TIMEOUT = 'quant.sandbox_timeout' as const;
export const QUANT_SANDBOX_SYNTAX = 'quant.sandbox_syntax' as const;
export const QUANT_VENUE_VAULT_UNSET = 'quant.venue_vault_unset' as const;
export const QUANT_STUDIO_RISK_BLOCK_REQUIRED = 'quant.studio_risk_block_required' as const;

export type QuantCode =
  | typeof QUANT_SANDBOX_UNWIRED
  | typeof QUANT_SANDBOX_ESCAPE
  | typeof QUANT_SANDBOX_TIMEOUT
  | typeof QUANT_SANDBOX_SYNTAX
  | typeof QUANT_VENUE_VAULT_UNSET
  | typeof QUANT_STUDIO_RISK_BLOCK_REQUIRED
  | 'quant.params_invalid';

export class QuantError extends Error {
  readonly code: QuantCode;

  constructor(code: QuantCode, detail: string) {
    super(`${code} — ${detail}`);
    this.name = 'QuantError';
    this.code = code;
  }
}
