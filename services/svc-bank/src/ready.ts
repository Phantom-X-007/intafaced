/**
 * GET `/ready` body. Job flags are not module kills.
 *
 * `loanAccrual: true` with `loans: false` is a real deploy: accrual can run
 * while BANK_LOANS_ENABLED is off. Omitting the kills made the job look like
 * the product.
 */
export type BankHttpReadyCardProgramme = {
  readonly id: string;
  readonly simulated: boolean;
  readonly displayName: string;
};

export type BankHttpReadyRampProgramme = {
  readonly id: string;
  readonly simulated: boolean;
  readonly displayName: string;
  readonly cryptoRail: string | null;
  readonly fiatLeg: string;
  readonly fiatVia: string;
};

export type BankHttpReadyInput = {
  readonly scheduledTransfers: boolean;
  readonly interestAccrual: boolean;
  readonly loanAccrual: boolean;
  readonly loanRiskSweep: boolean;
  readonly autoInvest: boolean;
  /** BANK_LOANS_ENABLED — product stop, not LOAN_ACCRUAL_ENABLED. */
  readonly loans: boolean;
  /** BANK_CARDS_ENABLED — product stop, not cardProgramme. */
  readonly cards: boolean;
  /** Same fact `createBankRouter` already takes as `autoInvestConvertWired`. */
  readonly autoInvestConvertWired: boolean;
  readonly cardProgramme: BankHttpReadyCardProgramme;
  readonly rampProgramme: BankHttpReadyRampProgramme;
};

export function bankHttpReady(input: BankHttpReadyInput) {
  return {
    ready: true as const,
    scheduledTransfers: input.scheduledTransfers,
    interestAccrual: input.interestAccrual,
    loanAccrual: input.loanAccrual,
    loanRiskSweep: input.loanRiskSweep,
    autoInvest: input.autoInvest,
    loans: input.loans,
    cards: input.cards,
    autoInvestConvertWired: input.autoInvestConvertWired,
    cardProgramme: {
      id: input.cardProgramme.id,
      simulated: input.cardProgramme.simulated,
      displayName: input.cardProgramme.displayName,
    },
    rampProgramme: {
      id: input.rampProgramme.id,
      simulated: input.rampProgramme.simulated,
      displayName: input.rampProgramme.displayName,
      cryptoRail: input.rampProgramme.cryptoRail,
      fiatLeg: input.rampProgramme.fiatLeg,
      fiatVia: input.rampProgramme.fiatVia,
    },
  };
}
