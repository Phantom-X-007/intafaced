/**
 * §13 socket — chargeback ledger wire (pay.fraud / D26-P1-P5).
 *
 * Recipes exist and are tested in `packages/ledger-client` (`chargebackOpen`,
 * `chargebackShortfall`, `chargebackWon`, `chargebackShortfallRecovered`).
 * Calling them from svc-pay moves value and is Class M money law — parked here
 * with an honest refuse so the dispute **case** mechanism can ship without a
 * silent book entry or a stub "unwired" string with no socket name.
 *
 * Closing this socket = owner sign-off on the four questions in
 * `packages/ledger-client/src/recipes/chargeback.ts`, then wiring dispute open
 * to post. Do not invent split legs or shortfall policy.
 * Blocklist / scheme list **content** remains Class X.
 */

export const CHARGEBACK_LEDGER_SOCKET_ID = 'socket.pay-chargeback-ledger-wire' as const;

export const CHARGEBACK_LEDGER_REFUSE_CODE = 'pay.chargeback_ledger_unwired' as const;

export interface ChargebackLedgerRefuse {
  readonly code: typeof CHARGEBACK_LEDGER_REFUSE_CODE;
  readonly socket: typeof CHARGEBACK_LEDGER_SOCKET_ID;
  readonly message: string;
  readonly disputeId: string;
  readonly paymentId: string;
}

/** Always refuses. Mechanism records the dispute; money stays unwired. */
export function refuseChargebackLedgerPost(input: {
  readonly disputeId: string;
  readonly paymentId: string;
}): ChargebackLedgerRefuse {
  return {
    code: CHARGEBACK_LEDGER_REFUSE_CODE,
    socket: CHARGEBACK_LEDGER_SOCKET_ID,
    message:
      'Chargeback ledger recipes exist but are not wired from svc-pay ' +
      `(${CHARGEBACK_LEDGER_SOCKET_ID}). Dispute case recorded; no value moved.`,
    disputeId: input.disputeId,
    paymentId: input.paymentId,
  };
}
