/**
 * trade.copy product policy — sovereign routing honesty (D26-P1-T3 / D-S-03).
 *
 * Fee-share and jurisdiction stay refuse-closed until owner publishes §8 law.
 */
import { COPY_FEE_SHARE_RESIDUAL, COPY_JURISDICTION_RESIDUAL, COPY_LAW_RESIDUAL } from './errors.js';

export type CopyPolicySummary = ReturnType<typeof describeCopyPolicy>;

/** Public honesty board for trade.copy — no PnL fees, no ranking invent. */
export function describeCopyPolicy() {
  return {
    sovereignShape: 'sovereign' as const,
    feeModel: 'protocol_fee_share' as const,
    pnlFeeForbidden: true as const,
    rankingForbidden: true as const,
    killUnfollowReal: true as const,
    feeShareUnsetResidual: COPY_FEE_SHARE_RESIDUAL,
    jurisdictionUnsetResidual: COPY_JURISDICTION_RESIDUAL,
    lawResidual: COPY_LAW_RESIDUAL,
    inventsLeaderShareBps: false as const,
    inventsJurisdictionAllowlist: false as const,
    moneyViaLedgerClientOnly: true as const,
  };
}
