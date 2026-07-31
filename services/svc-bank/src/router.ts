import { z } from 'zod';
import { router, publicProcedure, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { InsufficientFundsError, LedgerError, formatAmount, parseAmount } from '@intafaced/ledger-client';
import { BankError } from './errors.js';
import { accountForSpace } from './spaces/space-service.js';
import type { BankServices } from './bank-service.js';

/**
 * svc-bank's API.
 *
 * Two things to notice about what is NOT here.
 *
 * First, there is no procedure that writes a balance, because there is no
 * balance to write. `spaces.list` returns figures it just read from the ledger;
 * they are outputs, never inputs.
 *
 * Second, the two jobs — the standing-order runner and the daily accrual — are
 * NOT user-callable. They are operator surface (`admin:treasury`), because a
 * user able to trigger "run every due transfer" is a user able to choose when
 * other people's money moves.
 */

/** Money crosses the wire as a decimal string. Always. Never a number. */
const amountString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amount must be an unsigned decimal string (max 18dp)');

function toTrpcError(err: unknown): TRPCError {
  // An answer that has already been decided. Ownership refusals are thrown as
  // TRPCError from inside `guard`, and without this line every one of them was
  // re-wrapped as INTERNAL_SERVER_ERROR — a 500 that tells the caller to retry
  // something that can never succeed, and hides the refusal from any dashboard
  // grouping on status. That applied to the four `assertSelf` calls that were
  // already here, not only to the two added with this change.
  if (err instanceof TRPCError) return err;
  if (err instanceof InsufficientFundsError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }
  if (err instanceof BankError) {
    switch (err.code) {
      case 'bank.space_not_found':
      case 'bank.schedule_not_found':
      case 'bank.pool_not_found':
      case 'bank.position_not_found':
      case 'bank.loan_not_found':
      case 'bank.loan_product_not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'bank.not_owner':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case 'bank.pool_underfunded':
        // Not the caller's fault and not something a retry fixes — the pool
        // needs funding before this day can accrue.
        return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });

      // ── Loans: refusals that are NOT the caller's fault ───────────────────
      //
      // Each of these is the platform declining to act, and every one of them
      // would be a lie as a 400. A borrower told "bad request" when the lending
      // reserve is empty, or when the price feed is too stale to seize collateral
      // on, will retry the request forever and learn nothing.
      case 'bank.loan_reserve_underfunded':
      case 'bank.mark_unusable':
      case 'bank.mark_missing':
      case 'bank.mark_invalid':
      case 'bank.no_liquidation_counterparty':
      case 'bank.accrual_backlog':
        return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });

      // The loudest one. Collateral was exhausted and the insurance fund could
      // not make the reserve whole — a platform-side loss, not a client error.
      case 'bank.bad_debt_uncovered':
      case 'bank.policy_incoherent':
        return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });

      // Ordering refusals. Genuinely the caller's request being wrong for the
      // current state of the loan, so 409 rather than 400: nothing about the
      // input is malformed, and the same request may succeed later.
      case 'bank.loan_not_settled':
      case 'bank.loan_not_drawable':
      case 'bank.loan_liquidating':
      case 'bank.margin_call_required':
      case 'bank.loan_closed':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      default:
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }
  if (err instanceof LedgerError) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Bank operation failed', cause: err });
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toTrpcError(err);
  }
}

/**
 * A principal may only ever act on its own money, whatever its scopes say.
 *
 * WHY FORBIDDEN AND NOT NOT_FOUND. The trade-off is real and goes the other
 * way on the first reading: NOT_FOUND leaks strictly less, because it never
 * confirms that the id exists. We take FORBIDDEN anyway.
 *
 *   · It is the truth. Every id this guards is a v4 uuid the client already
 *     holds, so the overwhelmingly common way to reach this line is a user or
 *     an integration passing the wrong one. Telling them "no such schedule"
 *     sends them hunting for a record that is alive and well, and it is a lie
 *     we would have to keep telling in the logs too.
 *
 *   · The oracle it opens is worth almost nothing here. 122 bits of entropy
 *     means the id space is not enumerable, so FORBIDDEN discloses exactly one
 *     fact: a uuid the caller ALREADY OBTAINED belongs to someone else. An
 *     attacker who has the id has, by construction, already been somewhere they
 *     could see it.
 *
 * svc-agents' `ownedSession` makes the opposite call and returns NOT_FOUND for
 * both cases. That is a defensible reading of the same trade-off. What is not
 * defensible is doing both inside one service, so every ownership refusal in
 * svc-bank goes through this function and every one of them is FORBIDDEN.
 */
function assertSelf(principalUserId: string | undefined, ownerId: string): void {
  if (principalUserId !== ownerId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'This account belongs to another user' });
  }
}

const spaceOutput = z.object({
  id: z.string(),
  assetId: z.string(),
  kind: z.enum(['primary', 'named']),
  name: z.string(),
  goalTarget: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  /** Read from the ledger at request time. Not stored, not cached. */
  balance: amountString,
  /** The ledger account this space is a view of — so a client can verify us. */
  ledgerAccount: z.object({ ownerType: z.string(), ownerId: z.string(), assetId: z.string(), kind: z.string() }),
});

export function createBankRouter(bank: BankServices) {
  const spaces = router({
    list: scopedProcedure('bank:read', { module: 'bank' })
      .input(z.object({ assetId: z.string().min(1).max(16).optional() }))
      .output(z.array(spaceOutput))
      .query(async ({ ctx, input }) =>
        guard(async () => {
          const userId = ctx.principal.userId;
          const views = await bank.spaces.overview(userId, input.assetId);
          return views.map((v) => ({
            id: v.id,
            assetId: v.assetId,
            kind: v.kind,
            name: v.name,
            goalTarget: v.goalTarget === null ? null : formatAmount(v.goalTarget),
            lockedUntil: v.lockedUntil?.toISOString() ?? null,
            balance: v.balance,
            ledgerAccount: accountForSpace(v),
          }));
        }),
      ),

    /** Assets the user holds with no space yet — sourced from the ledger, not this table. */
    unnamed: scopedProcedure('bank:read', { module: 'bank' })
      .output(z.array(z.object({ assetId: z.string(), balance: amountString })))
      .query(async ({ ctx }) => guard(async () => bank.spaces.unnamedAssets(ctx.principal.userId))),

    create: scopedProcedure('bank:write', { module: 'bank' })
      .input(
        z.object({
          assetId: z.string().min(1).max(16),
          name: z.string().min(1).max(64),
          goalTarget: amountString.optional(),
          lockedUntil: z.string().datetime({ offset: true }).optional(),
        }),
      )
      .output(z.object({ id: z.string(), name: z.string() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          // The primary space must exist before a named one is useful — it is
          // where value arrives from every other module.
          await bank.spaces.ensurePrimary(ctx.principal.userId, input.assetId);
          const space = await bank.spaces.create({
            userId: ctx.principal.userId,
            assetId: input.assetId,
            name: input.name,
            goalTarget: input.goalTarget ? parseAmount(input.goalTarget) : null,
            lockedUntil: input.lockedUntil ? new Date(input.lockedUntil) : null,
          });
          return { id: space.id, name: space.name };
        }),
      ),

    archive: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ spaceId: z.string().uuid() }))
      .output(z.object({ archived: z.literal(true) }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const space = await bank.spaces.get(input.spaceId);
          assertSelf(ctx.principal.userId, space.userId);
          await bank.spaces.archive(input.spaceId);
          return { archived: true as const };
        }),
      ),
  });

  const transfers = router({
    /**
     * `transferId` is supplied by the client so a retried request is the same
     * transfer, not a second one (§5: idempotency keys are business keys).
     */
    create: scopedProcedure('bank:write', { module: 'bank' })
      .input(
        z.object({
          transferId: z.string().min(8).max(64),
          fromSpaceId: z.string().uuid(),
          toSpaceId: z.string().uuid(),
          amount: amountString,
        }),
      )
      .output(z.object({ ledgerTxId: z.string(), amount: amountString }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const from = await bank.spaces.get(input.fromSpaceId);
          assertSelf(ctx.principal.userId, from.userId);
          const result = await bank.transfers.transfer({
            transferId: input.transferId,
            fromSpaceId: input.fromSpaceId,
            toSpaceId: input.toSpaceId,
            amount: parseAmount(input.amount),
          });
          return { ledgerTxId: result.ledgerTxId, amount: result.amount };
        }),
      ),

    schedule: scopedProcedure('bank:write', { module: 'bank' })
      .input(
        z.object({
          fromSpaceId: z.string().uuid(),
          toSpaceId: z.string().uuid(),
          amount: amountString,
          cadence: z.enum(['daily', 'weekly', 'monthly']),
          startsAt: z.string().datetime({ offset: true }),
          endsAt: z.string().datetime({ offset: true }).optional(),
        }),
      )
      .output(z.object({ id: z.string(), nextRunAt: z.string() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const from = await bank.spaces.get(input.fromSpaceId);
          assertSelf(ctx.principal.userId, from.userId);
          const schedule = await bank.transfers.schedule({
            userId: ctx.principal.userId,
            fromSpaceId: input.fromSpaceId,
            toSpaceId: input.toSpaceId,
            amount: parseAmount(input.amount),
            cadence: input.cadence,
            startsAt: new Date(input.startsAt),
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
          });
          return { id: schedule.id, nextRunAt: schedule.nextRunAt.toISOString() };
        }),
      ),

    listSchedules: scopedProcedure('bank:read', { module: 'bank' })
      .output(
        z.array(
          z.object({
            id: z.string(),
            assetId: z.string(),
            amount: amountString,
            cadence: z.string(),
            nextRunAt: z.string(),
            status: z.string(),
          }),
        ),
      )
      .query(async ({ ctx }) =>
        guard(async () => {
          const schedules = await bank.transfers.listSchedules(ctx.principal.userId);
          return schedules.map((s) => ({
            id: s.id,
            assetId: s.assetId,
            amount: formatAmount(s.amount),
            cadence: s.cadence,
            nextRunAt: s.nextRunAt.toISOString(),
            status: s.status,
          }));
        }),
      ),

    /** What actually ran, and why anything did not. The user's answer to "where is my rent". */
    executions: scopedProcedure('bank:read', { module: 'bank' })
      .input(z.object({ scheduleId: z.string().uuid() }))
      .output(
        z.array(
          z.object({
            occurrence: z.number().int(),
            amount: amountString,
            status: z.string(),
            ledgerTxId: z.string().nullable(),
            rejectionCode: z.string().nullable(),
          }),
        ),
      )
      .query(async ({ ctx, input }) =>
        guard(async () => {
          // `bank:read` answers "may this principal read bank data". It never
          // answered "whose", and without the next two lines this returned
          // another user's transfer history, amounts and rejection codes
          // included, to anyone holding the scope and a schedule id.
          const schedule = await bank.transfers.getSchedule(input.scheduleId);
          assertSelf(ctx.principal.userId, schedule.userId);
          return bank.transfers.executions(input.scheduleId);
        }),
      ),

    cancel: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ scheduleId: z.string().uuid() }))
      .output(z.object({ cancelled: z.literal(true) }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          // The ownership check runs BEFORE the cancel, not as a filter on its
          // result: `cancelSchedule` is an UPDATE, and a check made afterwards
          // would refuse a caller whose write had already landed.
          const schedule = await bank.transfers.getSchedule(input.scheduleId);
          assertSelf(ctx.principal.userId, schedule.userId);
          await bank.transfers.cancelSchedule(input.scheduleId);
          return { cancelled: true as const };
        }),
      ),
  });

  const earn = router({
    pools: scopedProcedure('bank:read', { module: 'bank' })
      .input(z.object({ assetId: z.string().min(1).max(16).optional() }))
      .output(
        z.array(
          z.object({
            id: z.string(),
            assetId: z.string(),
            kind: z.enum(['flexible', 'fixed']),
            name: z.string(),
            aprBps: z.number().int(),
            termDays: z.number().int().nullable(),
            minDeposit: amountString,
          }),
        ),
      )
      .query(async ({ input }) =>
        guard(async () => {
          const pools = await bank.earn.listPools(input.assetId);
          return pools.map((p) => ({
            id: p.id,
            assetId: p.assetId,
            kind: p.kind,
            name: p.name,
            aprBps: p.aprBps,
            termDays: p.termDays,
            minDeposit: formatAmount(p.minDeposit),
          }));
        }),
      ),

    deposit: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ poolId: z.string().uuid(), amount: amountString, positionId: z.string().uuid().optional() }))
      .output(z.object({ positionId: z.string(), maturesAt: z.string().nullable() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const position = await bank.earn.deposit({
            poolId: input.poolId,
            userId: ctx.principal.userId,
            amount: parseAmount(input.amount),
            ...(input.positionId ? { positionId: input.positionId } : {}),
          });
          return { positionId: position.id, maturesAt: position.maturesAt?.toISOString() ?? null };
        }),
      ),

    withdraw: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ positionId: z.string().uuid() }))
      .output(z.object({ positionId: z.string(), principal: amountString }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const existing = await bank.earn.position(input.positionId);
          assertSelf(ctx.principal.userId, existing.userId);
          const closed = await bank.earn.withdraw(input.positionId);
          return { positionId: closed.id, principal: formatAmount(closed.principal) };
        }),
      ),

    positions: scopedProcedure('bank:read', { module: 'bank' })
      .output(
        z.array(
          z.object({
            id: z.string(),
            poolId: z.string(),
            assetId: z.string(),
            principal: amountString,
            maturesAt: z.string().nullable(),
          }),
        ),
      )
      .query(async ({ ctx }) =>
        guard(async () => {
          const positions = await bank.earn.positionsOf(ctx.principal.userId);
          return positions.map((p) => ({
            id: p.id,
            poolId: p.poolId,
            assetId: p.assetId,
            principal: formatAmount(p.principal),
            maturesAt: p.maturesAt?.toISOString() ?? null,
          }));
        }),
      ),
  });

  const analytics = router({
    spend: scopedProcedure('bank:read', { module: 'bank' })
      .input(
        z.object({
          assetId: z.string().min(1).max(16),
          from: z.string().datetime({ offset: true }),
          to: z.string().datetime({ offset: true }),
        }),
      )
      .output(
        z.object({
          assetId: z.string(),
          from: z.string(),
          to: z.string(),
          outflowByCategory: z.record(z.string()),
          totalOutflow: z.string(),
          totalInflow: z.string(),
          net: z.string(),
          movements: z.number().int(),
        }),
      )
      .query(async ({ ctx, input }) =>
        guard(async () => {
          const summary = await bank.analytics.spendSummary({
            userId: ctx.principal.userId,
            assetId: input.assetId,
            range: { from: new Date(input.from), to: new Date(input.to) },
          });
          return {
            assetId: summary.assetId,
            from: summary.from,
            to: summary.to,
            outflowByCategory: summary.outflowByCategory,
            totalOutflow: summary.totalOutflow,
            totalInflow: summary.totalInflow,
            net: summary.net,
            movements: summary.movements,
          };
        }),
      ),
  });

  /**
   * LOANS (§8.1).
   *
   * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
   *
   * There is no user-callable `liquidate`, and no user-callable `mark`. Both are
   * operator surface, in `ops`, for the same reason the standing-order runner and
   * the accrual are: a user who can choose WHEN a mark is taken is a user who can
   * choose the price their own — or somebody else's — collateral is valued at.
   * The whole point of the deviation breaker and the staleness window in
   * `prices.ts` is that the mark is not the caller's to pick.
   *
   * There is also no `releaseCollateral` that takes an amount. Release is
   * all-or-nothing on a settled loan (`close`), because a partial release is
   * indistinguishable in its effect from an unsecured top-up of leverage, and it
   * would need its own LTV check to be safe. `addCollateral` covers the direction
   * a borrower actually needs in a hurry.
   */
  const loans = router({
    products: scopedProcedure('bank:read', { module: 'bank' })
      .input(z.object({ assetId: z.string().min(1).max(16).optional() }))
      .output(
        z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            debtAssetId: z.string(),
            collateralAssetId: z.string(),
            quoteAssetId: z.string(),
            aprBps: z.number().int(),
            maxLtvBps: z.number().int(),
            marginCallLtvBps: z.number().int(),
            liquidationLtvBps: z.number().int(),
            minPrincipal: amountString,
          }),
        ),
      )
      .query(async ({ input }) =>
        guard(async () => {
          const products = await bank.loans.listProducts(input.assetId);
          return products.map((p) => ({
            id: p.id,
            name: p.name,
            debtAssetId: p.debtAssetId,
            collateralAssetId: p.collateralAssetId,
            quoteAssetId: p.quoteAssetId,
            aprBps: p.aprBps,
            maxLtvBps: p.maxLtvBps,
            // The two thresholds a borrower must be able to see BEFORE they
            // borrow. Publishing the liquidation level is not a courtesy: a
            // leveraged product whose liquidation price is discoverable only by
            // being liquidated is not a product anyone can manage.
            marginCallLtvBps: p.policy.marginCallLtvBps,
            liquidationLtvBps: p.policy.liquidationLtvBps,
            minPrincipal: formatAmount(p.minPrincipal),
          }));
        }),
      ),

    /**
     * `loanId` is supplied by the client so a retried request is the same loan,
     * not a second one (§5). A timeout on this call must not leave a borrower with
     * two leveraged positions against collateral they meant to pledge once.
     */
    open: scopedProcedure('bank:write', { module: 'bank' })
      .input(
        z.object({
          loanId: z.string().uuid(),
          productId: z.string().uuid(),
          collateralAmount: amountString,
          principal: amountString,
        }),
      )
      .output(z.object({ loanId: z.string(), status: z.string(), ltvBps: z.number().int(), drawLedgerTxId: z.string() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const result = await bank.loans.open({
            loanId: input.loanId,
            productId: input.productId,
            userId: ctx.principal.userId,
            collateralAmount: parseAmount(input.collateralAmount),
            principal: parseAmount(input.principal),
          });
          return {
            loanId: result.loan.id,
            status: result.loan.status,
            ltvBps: result.ltvBps,
            drawLedgerTxId: result.drawLedgerTxId,
          };
        }),
      ),

    list: scopedProcedure('bank:read', { module: 'bank' })
      .output(
        z.array(
          z.object({
            id: z.string(),
            productId: z.string(),
            debtAssetId: z.string(),
            collateralAssetId: z.string(),
            principal: amountString,
            outstandingPrincipal: amountString,
            outstandingInterest: amountString,
            collateral: amountString,
            aprBps: z.number().int(),
            status: z.string(),
            marginCalledAt: z.string().nullable(),
          }),
        ),
      )
      .query(async ({ ctx }) =>
        guard(async () => {
          const rows = await bank.loans.loansOf(ctx.principal.userId);
          return Promise.all(
            rows.map(async (loan) => {
              const debt = await bank.loans.outstanding(loan.id);
              return {
                id: loan.id,
                productId: loan.productId,
                debtAssetId: loan.debtAssetId,
                collateralAssetId: loan.collateralAssetId,
                principal: formatAmount(loan.principal),
                // Derived at read time from write-once rows. There is no
                // `outstanding` column, and the schema comments say why.
                outstandingPrincipal: formatAmount(debt.principal),
                outstandingInterest: formatAmount(debt.interest),
                collateral: formatAmount(await bank.loans.collateralOf(loan)),
                aprBps: loan.aprBps,
                status: loan.status,
                marginCalledAt: loan.marginCalledAt?.toISOString() ?? null,
              };
            }),
          );
        }),
      ),

    /**
     * The borrower's own risk view.
     *
     * Read-only and portfolio-wide, so someone can see a margin call coming
     * rather than learning about it from the liquidation. It marks; it never acts.
     */
    health: scopedProcedure('bank:read', { module: 'bank' })
      .output(
        z.object({
          debtValue: amountString,
          collateralValue: amountString,
          portfolioLtvBps: z.number().int(),
          loans: z.array(
            z.object({
              loanId: z.string(),
              debtValue: amountString,
              collateralValue: amountString,
              ltvBps: z.number().int(),
            }),
          ),
        }),
      )
      .query(async ({ ctx }) =>
        guard(async () => {
          const mark = await bank.loans.markUser(ctx.principal.userId);
          return {
            debtValue: formatAmount(mark.debtValue),
            collateralValue: formatAmount(mark.collateralValue),
            portfolioLtvBps: mark.portfolioLtvBps,
            loans: mark.loans.map((l) => ({
              loanId: l.loanId,
              debtValue: formatAmount(l.debtValue),
              collateralValue: formatAmount(l.collateralValue),
              ltvBps: l.ltvBps,
            })),
          };
        }),
      ),

    /** The cheapest way out of a margin call, and the one everyone wants taken. */
    addCollateral: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ loanId: z.string().uuid(), amount: amountString }))
      .output(z.object({ ledgerTxId: z.string(), sequence: z.number().int() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const loan = await bank.loans.loan(input.loanId);
          assertSelf(ctx.principal.userId, loan.userId);
          return bank.loans.addCollateral({ loanId: input.loanId, amount: parseAmount(input.amount) });
        }),
      ),

    repay: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ loanId: z.string().uuid(), amount: amountString }))
      .output(
        z.object({
          ledgerTxId: z.string(),
          interestPaid: amountString,
          principalPaid: amountString,
          remainingPrincipal: amountString,
          remainingInterest: amountString,
          closed: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const loan = await bank.loans.loan(input.loanId);
          assertSelf(ctx.principal.userId, loan.userId);
          const result = await bank.loans.repay({ loanId: input.loanId, amount: parseAmount(input.amount) });
          return {
            ledgerTxId: result.ledgerTxId,
            interestPaid: formatAmount(result.interestPaid),
            principalPaid: formatAmount(result.principalPaid),
            remainingPrincipal: formatAmount(result.remaining.principal),
            remainingInterest: formatAmount(result.remaining.interest),
            closed: result.closed,
          };
        }),
      ),

    /** Release collateral on a loan that owes nothing. Refuses otherwise. */
    close: scopedProcedure('bank:write', { module: 'bank' })
      .input(z.object({ loanId: z.string().uuid() }))
      .output(z.object({ released: amountString, ledgerTxId: z.string().nullable() }))
      .mutation(async ({ ctx, input }) =>
        guard(async () => {
          const loan = await bank.loans.loan(input.loanId);
          assertSelf(ctx.principal.userId, loan.userId);
          const result = await bank.loans.releaseSettled(input.loanId);
          return { released: formatAmount(result.released), ledgerTxId: result.ledgerTxId };
        }),
      ),
  });

  /**
   * Operator surface. The jobs live behind `admin:treasury` — a scope §4.1 marks
   * interactive-only, so it can never be held by a long-lived API key.
   */
  const ops = router({
    runDueTransfers: scopedProcedure('admin:treasury')
      .input(z.object({ limit: z.number().int().min(1).max(10_000).optional() }))
      .output(
        z.object({
          schedulesConsidered: z.number().int(),
          settled: z.number().int(),
          rejected: z.number().int(),
          alreadyFired: z.number().int(),
        }),
      )
      .mutation(async ({ input }) =>
        guard(async () => bank.transfers.runDueTransfers(input.limit === undefined ? {} : { limit: input.limit })),
      ),

    accrueInterest: scopedProcedure('admin:treasury')
      .input(z.object({ poolId: z.string().uuid().optional(), at: z.string().datetime({ offset: true }).optional() }))
      .output(
        z.array(
          z.object({
            poolId: z.string(),
            date: z.string(),
            paid: amountString,
            recipients: z.number().int(),
            alreadyAccrued: z.boolean(),
          }),
        ),
      )
      .mutation(async ({ input }) =>
        guard(async () => {
          const at = input.at ? new Date(input.at) : new Date();
          const results = input.poolId ? [await bank.earn.accrue({ poolId: input.poolId, at })] : await bank.earn.accrueAll(at);
          return results.map((r) => ({
            poolId: r.poolId,
            date: r.date,
            paid: formatAmount(r.paid),
            recipients: r.recipients,
            alreadyAccrued: r.alreadyAccrued,
          }));
        }),
      ),

    fundPool: scopedProcedure('admin:treasury')
      .input(z.object({ poolId: z.string().uuid(), fundingId: z.string().min(4).max(64), amount: amountString }))
      .output(z.object({ ledgerTxId: z.string() }))
      .mutation(async ({ input }) =>
        guard(async () => bank.earn.fundPool({ poolId: input.poolId, fundingId: input.fundingId, amount: parseAmount(input.amount) })),
      ),

    // ── Loans (§8.1) ─────────────────────────────────────────────────────────
    //
    // THE RISK SWEEP AND THE LADDER ARE OPERATOR SURFACE, NOT USER SURFACE.
    //
    // A user able to trigger a mark is a user able to choose when their own — or
    // a rival's — collateral is priced, which is precisely what the staleness
    // window and the deviation breaker exist to take out of anyone's hands. Same
    // reasoning as the standing-order runner above: safe to run twice is not a
    // reason to let an untrusted caller choose when.

    fundLoanReserve: scopedProcedure('admin:treasury')
      .input(z.object({ debtAssetId: z.string().min(1).max(16), fundingId: z.string().min(4).max(64), amount: amountString }))
      .output(z.object({ ledgerTxId: z.string() }))
      .mutation(async ({ input }) =>
        guard(async () =>
          bank.loans.fundReserve({ debtAssetId: input.debtAssetId, fundingId: input.fundingId, amount: parseAmount(input.amount) }),
        ),
      ),

    accrueLoanInterest: scopedProcedure('admin:treasury')
      .input(z.object({ loanId: z.string().uuid().optional(), at: z.string().datetime({ offset: true }).optional() }))
      .output(z.array(z.object({ loanId: z.string(), charged: amountString, days: z.number().int() })))
      .mutation(async ({ input }) =>
        guard(async () => {
          const at = input.at ? new Date(input.at) : new Date();
          if (input.loanId) {
            const one = await bank.loans.accrue({ loanId: input.loanId, until: at });
            return [{ loanId: one.loanId, charged: formatAmount(one.charged), days: one.days.length }];
          }
          const all = await bank.loans.accrueAll(at);
          return all.map((r) => ({ loanId: r.loanId, charged: formatAmount(r.charged), days: r.days }));
        }),
      ),

    runRiskSweep: scopedProcedure('admin:treasury')
      .input(z.object({ limit: z.number().int().min(1).max(10_000).optional() }))
      .output(
        z.object({
          marked: z.number().int(),
          called: z.number().int(),
          liquidated: z.number().int(),
          cleared: z.number().int(),
          // Loans the sweep declined to act on — an unusable mark, no
          // counterparty, a reserve that cannot cover. Surfaced rather than
          // swallowed: a silent refusal is a position nobody is watching.
          refused: z.array(z.object({ loanId: z.string(), reason: z.string() })),
        }),
      )
      .mutation(async ({ input }) => guard(async () => bank.loans.runRiskSweep(input.limit === undefined ? {} : { limit: input.limit }))),

    /** Re-drive loans stuck between the collateral lock and the draw. */
    resumePendingLoans: scopedProcedure('admin:treasury')
      .input(z.object({ limit: z.number().int().min(1).max(1_000).optional() }))
      .output(z.array(z.object({ loanId: z.string(), outcome: z.string(), reason: z.string().optional() })))
      .mutation(async ({ input }) => guard(async () => bank.loans.resumePending(input.limit))),

    /** Give up on a pending loan and give the borrower their collateral back. */
    abandonPendingLoan: scopedProcedure('admin:treasury')
      .input(z.object({ loanId: z.string().uuid() }))
      .output(z.object({ released: amountString, ledgerTxId: z.string().nullable() }))
      .mutation(async ({ input }) =>
        guard(async () => {
          const result = await bank.loans.abandonPending(input.loanId);
          return { released: formatAmount(result.released), ledgerTxId: result.ledgerTxId };
        }),
      ),

    /**
     * The reserve identity, as a query rather than an investigation:
     * `balance(loanReserve) + Σ outstanding principal` against what was funded.
     */
    reconcileLoanReserve: scopedProcedure('admin:treasury')
      .input(z.object({ debtAssetId: z.string().min(1).max(16) }))
      .output(
        z.object({
          reserveBalance: amountString,
          outstandingPrincipal: amountString,
          badDebt: amountString,
          funded: amountString,
          insuranceCapacity: amountString,
        }),
      )
      .query(async ({ input }) =>
        guard(async () => {
          const r = await bank.loans.reconcileReserve(input.debtAssetId);
          return {
            reserveBalance: formatAmount(r.reserveBalance),
            outstandingPrincipal: formatAmount(r.outstandingPrincipal),
            badDebt: formatAmount(r.badDebt),
            funded: formatAmount(r.funded),
            insuranceCapacity: formatAmount(await bank.loans.insuranceCapacity(input.debtAssetId)),
          };
        }),
      ),
  });

  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-bank') }))
      .query(() => ({ ok: true, service: 'svc-bank' as const })),
    spaces,
    transfers,
    earn,
    loans,
    analytics,
    ops,
  });
}

export type BankRouter = ReturnType<typeof createBankRouter>;
