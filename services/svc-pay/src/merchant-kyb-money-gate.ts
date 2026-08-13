/**
 * Layer B — KYB money gate (D26-P1-P10).
 *
 * ADR: docs/adr/2026-08-12-pay-write-kyb-grant-mechanism-shape.md
 *
 * Separate from Layer A (scope issuance). Approving KYB never invents `pay:*`.
 * Holding `pay:write` never skips KYB under live acquiring.
 *
 * Path fence: does not touch #1720 `kyb-*` / `psp-mode*` / dossier writers —
 * those own transitions; this module only reads `kybStatus` on money doors.
 */

import type { ValueMovementPolicy } from './rails/posture.js';

export type MerchantKybStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** Distinct from `pay.merchant_inactive` and KYB transition codes. */
export const PAY_KYB_REQUIRED_CODE = 'pay.kyb_required' as const;

export type MerchantKybMoneyGateInput = {
  merchantId: string;
  status: string;
  kybStatus: MerchantKybStatus;
  /** Boot / service value-movement posture. */
  valueMovement: ValueMovementPolicy;
};

/**
 * Live acquiring (`live-only`) requires `kybStatus === 'approved'`.
 *
 * `allow-sandbox` keeps the fixture path status-only — sandbox suites and
 * `decideKybStub` remain usable without inventing a production grantor.
 *
 * Returns a refuse payload or `null` when the money door may continue.
 */
export function merchantKybMoneyGateRefusal(
  input: MerchantKybMoneyGateInput,
): { code: typeof PAY_KYB_REQUIRED_CODE; message: string; detail: { kybStatus: MerchantKybStatus } } | null {
  if (input.valueMovement !== 'live-only') return null;
  if (input.kybStatus === 'approved') return null;
  return {
    code: PAY_KYB_REQUIRED_CODE,
    message: `Merchant ${input.merchantId} KYB is ${input.kybStatus}; live acquiring requires approved KYB`,
    detail: { kybStatus: input.kybStatus },
  };
}
