"""Add releaseExcess. Self-deleting one-shot. Do not match seize marksFor."""
from pathlib import Path

LOAN = Path('services/svc-bank/src/loans/loan-service.ts')
ROUTER = Path('services/svc-bank/src/router.ts')

ADD_END = '''    const sequence = await this.nextCollateralSequence(loan.id);
    const txId = await this.lockCollateral(loan, input.amount, sequence);
    return { ledgerTxId: txId, sequence };
  }

  private async lockCollateral'''

ADD_END_NEW = '''    const sequence = await this.nextCollateralSequence(loan.id);
    const txId = await this.lockCollateral(loan, input.amount, sequence);
    return { ledgerTxId: txId, sequence };
  }

  /**
   * Release excess collateral from a live loan through ledger-client.
   *
   * Marks first. A missing mark refuses `bank.mark_missing` before any release —
   * withdrawing against a book nobody priced is the same lie as originating on a
   * default. After-release LTV is computed from those marks and the product cap;
   * this method does not invent a rate. Curing is still the next mark's job.
   */
  async releaseExcess(input: { loanId: string; amount: Amount; now?: Date }): Promise<{ ledgerTxId: string; sequence: number }> {
    const now = input.now ?? new Date();
    const loan = await this.loan(input.loanId);
    if (loan.status === 'repaid' || loan.status === 'liquidated') {
      throw new BankError(`Loan ${loan.id} is ${loan.status}`, 'bank.loan_closed');
    }
    if (loan.status === 'pending') {
      throw new BankError(
        `Loan ${loan.id} is pending — abandon it rather than peeling collateral off an undrawn row`,
        'bank.loan_not_drawable',
      );
    }
    if (input.amount <= 0n) throw new BankError('Collateral release must be positive', 'bank.below_minimum');

    const marks = await this.marksFor(loan.collateralAssetId, loan.debtAssetId, loan.quoteAssetId, now);
    const product = await this.product(loan.productId);
    const debt = await this.outstanding(loan.id);
    const held = await this.collateralOf(loan);
    if (input.amount > held) {
      throw new BankError(
        `Loan ${loan.id} holds ${formatAmount(held)} ${loan.collateralAssetId}, not ${formatAmount(input.amount)}`,
        'bank.loan_collateral_short',
      );
    }

    const remaining = held - input.amount;
    const collateralMark = marks.get(loan.collateralAssetId)!;
    const debtMark = marks.get(loan.debtAssetId)!;
    const debtValue = quoteValue(debt.total, debtMark.price, 'ceil');
    const collateralValue = quoteValue(remaining, collateralMark.price, 'floor');
    const afterLtv = ltvBps(debtValue, collateralValue);
    if (afterLtv > product.maxLtvBps) {
      throw new BankError(
        `Release would put loan ${loan.id} at LTV ${describeLtv(afterLtv)} above the ${describeLtv(product.maxLtvBps)} limit for "${product.name}"`,
        'bank.ltv_exceeded',
      );
    }

    const sequence = await this.nextCollateralSequence(loan.id);
    const txId = await this.releaseCollateral(loan, input.amount, sequence);
    return { ledgerTxId: txId, sequence };
  }

  private async lockCollateral'''

REL_OLD = '''  private async releaseCollateral(loan: LoanRecord, amount: Amount): Promise<string> {
    const sequence = await this.nextCollateralSequence(loan.id);
    return this.drivenPost({
      claim: async (tx) => {
        const rows = await tx<Array<{ id: string; ledger_tx_id: string | null }>>`
          INSERT INTO bank.loan_collateral_events (loan_id, sequence, direction, amount)
          VALUES (${loan.id}, ${sequence}, 'release', ${formatAmount(amount)}::numeric)
          ON CONFLICT (loan_id, sequence) DO NOTHING
          RETURNING id, ledger_tx_id
        `;
        if (rows.length > 0) return { claimed: true as const, id: rows[0]!.id };
        const existing = await tx<Array<{ id: string; ledger_tx_id: string | null }>>`
          SELECT id, ledger_tx_id FROM bank.loan_collateral_events WHERE loan_id = ${loan.id} AND sequence = ${sequence}
        `;
        return { claimed: false as const, id: existing[0]!.id, ledgerTxId: existing[0]!.ledger_tx_id };
      },
      post: () =>
        this.ledger.post(
          recipes.loanCollateralRelease({
            loanId: loan.id,
            userId: loan.userId,
            collateralAssetId: loan.collateralAssetId,
            amount,
            sequence,
          }),
        ),
      table: 'loan_collateral_events',
    });
  }
'''

REL_NEW = '''  private async releaseCollateral(loan: LoanRecord, amount: Amount, sequence?: number): Promise<string> {
    const seq = sequence ?? (await this.nextCollateralSequence(loan.id));
    return this.drivenPost({
      claim: async (tx) => {
        const rows = await tx<Array<{ id: string; ledger_tx_id: string | null }>>`
          INSERT INTO bank.loan_collateral_events (loan_id, sequence, direction, amount)
          VALUES (${loan.id}, ${seq}, 'release', ${formatAmount(amount)}::numeric)
          ON CONFLICT (loan_id, sequence) DO NOTHING
          RETURNING id, ledger_tx_id
        `;
        if (rows.length > 0) return { claimed: true as const, id: rows[0]!.id };
        const existing = await tx<Array<{ id: string; ledger_tx_id: string | null }>>`
          SELECT id, ledger_tx_id FROM bank.loan_collateral_events WHERE loan_id = ${loan.id} AND sequence = ${seq}
        `;
        return { claimed: false as const, id: existing[0]!.id, ledgerTxId: existing[0]!.ledger_tx_id };
      },
      post: () =>
        this.ledger.post(
          recipes.loanCollateralRelease({
            loanId: loan.id,
            userId: loan.userId,
            collateralAssetId: loan.collateralAssetId,
            amount,
            sequence: seq,
          }),
        ),
      table: 'loan_collateral_events',
    });
  }
'''

COMMENT_OLD = '''   * There is also no `releaseCollateral` that takes an amount. Release is
   * all-or-nothing on a settled loan (`close`), because a partial release is
   * indistinguishable in its effect from an unsecured top-up of leverage, and it
   * would need its own LTV check to be safe. `addCollateral` covers the direction
   * a borrower actually needs in a hurry.
'''

COMMENT_NEW = '''   * Settled release stays all-or-nothing on `close`. Partial release of excess
   * (`releaseExcess`) is the exception: it asks for a mark and refuses
   * `bank.ltv_exceeded` if the remainder would sit above the product cap. A
   * missing mark refuses before any post. No invented rate.
'''

DOOR_OLD = '''    addCollateral: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ loanId: z.string().uuid(), amount: amountString }))
      .output(z.object({ ledgerTxId: z.string(), sequence: z.number().int() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const loan = await bank.loans.loan(input.loanId);
          assertSelf(ctx.principal.userId, loan.userId);
          return bank.loans.addCollateral({ loanId: input.loanId, amount: parseAmount(input.amount) });
        }),
      ),

    repay:'''

DOOR_NEW = '''    addCollateral: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ loanId: z.string().uuid(), amount: amountString }))
      .output(z.object({ ledgerTxId: z.string(), sequence: z.number().int() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const loan = await bank.loans.loan(input.loanId);
          assertSelf(ctx.principal.userId, loan.userId);
          return bank.loans.addCollateral({ loanId: input.loanId, amount: parseAmount(input.amount) });
        }),
      ),

    /** Peel surplus collateral. Marks first; refuses if the remainder would exceed the product cap. */
    releaseExcess: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ loanId: z.string().uuid(), amount: amountString }))
      .output(z.object({ ledgerTxId: z.string(), sequence: z.number().int() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const loan = await bank.loans.loan(input.loanId);
          assertSelf(ctx.principal.userId, loan.userId);
          return bank.loans.releaseExcess({ loanId: input.loanId, amount: parseAmount(input.amount) });
        }),
      ),

    repay:'''

src = LOAN.read_text()
if 'async releaseExcess(input:' in src:
    print('loan-service already has releaseExcess')
else:
    if ADD_END not in src:
        raise SystemExit('addCollateral end anchor missing')
    if REL_OLD not in src:
        raise SystemExit('releaseCollateral body anchor missing')
    src = src.replace(ADD_END, ADD_END_NEW, 1).replace(REL_OLD, REL_NEW, 1)
    LOAN.write_text(src)
    print('patched loan-service')

rt = ROUTER.read_text()
if 'releaseExcess: scopedProcedure' in rt:
    print('router already has releaseExcess')
else:
    if COMMENT_OLD not in rt:
        raise SystemExit('router comment anchor missing')
    if DOOR_OLD not in rt:
        raise SystemExit('router door anchor missing')
    rt = rt.replace(COMMENT_OLD, COMMENT_NEW, 1).replace(DOOR_OLD, DOOR_NEW, 1)
    ROUTER.write_text(rt)
    print('patched router')
