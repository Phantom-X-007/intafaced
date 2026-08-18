import { z } from 'zod';
import { scopedProcedure } from '@intafaced/contracts';
import {
  AFFILIATE_PAYOUT_RESIDUAL,
  AffiliatePayoutRefuseError,
  affiliateFreezeHonestyLine,
  affiliateMemberListStatusLine,
  affiliateTreeStatusLine,
} from './affiliates/admin-tree-read.js';
import {
  affiliatePayoutPlanStatusLine,
  assertPayoutRateProvenance,
  planAffiliatePayout,
  postAffiliatePayout,
} from './affiliates/payout-engine.js';
import type { ReferralService } from './affiliates/referral-service.js';
import type { FreezeService } from './affiliates/freeze-service.js';
import {
  accrualTierLawIsPublished,
  type AccrualTierLaw,
} from './affiliates/commission-rate-law.js';
import { accrueTreeUnderRateAuthority, accrualTreeAuthorityStatusLine } from './affiliates/accrual-tree-authority.js';
import type { AccrualStore } from './affiliates/accrual-store.js';
import type { LedgerClient } from '@intafaced/ledger-client';
import { toTrpcError } from './router-shared.js';

export type AffiliateRouterArgs = {
  requireReferral: () => ReferralService;
  requireFreeze: () => FreezeService;
  requireAccruals: () => AccrualStore;
  freeze: FreezeService | undefined;
  accrualTierLaw: AccrualTierLaw;
  ledger: Pick<LedgerClient, 'post'> | undefined;
};

export function affiliateMoneyRoutes(args: AffiliateRouterArgs) {
  const { requireReferral, requireFreeze, requireAccruals, freeze, accrualTierLaw, ledger } = args;
  return {
      payout: scopedProcedure('admin:write')
        .input(
          z.object({
            feeEventId: z.string().min(1).max(120).optional(),
            beneficiaryId: z.string().uuid().optional(),
            dryRun: z.boolean().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            // Rate law first — before store, ledger, or field validation.
            assertPayoutRateProvenance([], accrualTierLaw);

            const feeEventId = input.feeEventId?.trim() ?? '';
            if (!feeEventId) {
              throw new AffiliatePayoutRefuseError(
                'feeEventId is required — a payout idempotency key must be derived from the business event, never a clock',
                'affiliate.payout.invalid',
                AFFILIATE_PAYOUT_RESIDUAL,
              );
            }

            const rows = await requireAccruals().listByFeeEvent(feeEventId);
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();

            const plan = planAffiliatePayout({
              feeEventId,
              rows: input.beneficiaryId ? rows.filter((r) => r.beneficiaryId === input.beneficiaryId) : rows,
              law: accrualTierLaw,
              frozenBeneficiaryIds: frozen,
            });

            if (input.dryRun === true) {
              return {
                posted: false as const,
                feeEventId: plan.feeEventId,
                asset: plan.asset,
                totalCommission: plan.totalCommission,
                legCount: plan.legs.length,
                beneficiaryCount: plan.beneficiaryCount,
                idempotencyKeys: plan.legs.flatMap((l) => [l.sweep.idempotencyKey, l.payout.idempotencyKey]),
                statusLine: affiliatePayoutPlanStatusLine(plan),
              };
            }

            // §0.6: without a ledger client this path cannot move value, and it
            // says so rather than pretending a plan is a payment.
            if (!ledger) {
              throw new AffiliatePayoutRefuseError(
                'Affiliate payout cannot post — no ledger client is wired into this deployment',
                'affiliate.payout.ledger_unwired',
                AFFILIATE_PAYOUT_RESIDUAL,
              );
            }

            const receipt = await postAffiliatePayout(ledger, plan);
            return {
              posted: true as const,
              feeEventId: receipt.feeEventId,
              asset: receipt.asset,
              totalCommission: receipt.totalCommission,
              legCount: receipt.legCount,
              beneficiaryCount: receipt.beneficiaryCount,
              idempotencyKeys: receipt.idempotencyKeys,
              statusLine: affiliatePayoutPlanStatusLine(plan),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Slice B dry-run: fee event → commission rows under rate authority (D26-P1-O2).
       * NEVER posts ledger. Zero fee → empty rows. Real payout is affiliates.payout.
       * Simulation tiers allowed here only; durable accrue refuses invent.
       */
      accrueDryRun: scopedProcedure('admin:read')
        .input(
          z.object({
            feeEventId: z.string().min(1).max(120),
            userId: z.string().uuid(),
            feeAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/),
            asset: z.string().min(1).max(32),
            /** Module fee pool that holds this fee (trade / pay / …). Default identity for legacy. */
            sourceModule: z
              .string()
              .regex(/^[a-z][a-z0-9_-]{0,31}$/)
              .optional(),
            at: z.string().datetime().optional(),
            /** Dry-run simulation only — never written to durable store. */
            tiers: z
              .array(
                z.object({
                  hop: z.number().int().min(0).max(20),
                  rate: z.string().regex(/^(0(\.\d{1,18})?|1(\.0{1,18})?)$/),
                }),
              )
              .max(20)
              .optional(),
          }),
        )
        .output(
          z.object({
            rows: z.array(
              z.object({
                feeEventId: z.string(),
                beneficiaryId: z.string().uuid(),
                payerId: z.string().uuid(),
                hop: z.number().int(),
                rate: z.string(),
                feeAmount: z.string(),
                commissionAmount: z.string(),
                asset: z.string(),
                accruedAt: z.string(),
                sourceModule: z.string(),
              }),
            ),
            frozenSkipped: z.number().int(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const parent = await requireReferral().loadParentMap();
            const frozen = await requireFreeze().frozenIds();
            const fee = {
              feeEventId: input.feeEventId,
              userId: input.userId,
              feeAmount: input.feeAmount,
              asset: input.asset,
              sourceModule: input.sourceModule,
              at: input.at ? new Date(input.at) : new Date(),
            };
            const out = accrueTreeUnderRateAuthority({
              fee,
              parent,
              law: accrualTierLaw,
              frozenBeneficiaryIds: frozen,
              simulationTiers: input.tiers,
              mode: 'dryRun',
            });
            return {
              frozenSkipped: out.frozenSkipped,
              rows: out.rows.map((r) => ({
                feeEventId: r.feeEventId,
                beneficiaryId: r.beneficiaryId,
                payerId: r.payerId,
                hop: r.hop,
                rate: r.rate,
                feeAmount: r.feeAmount,
                commissionAmount: r.commissionAmount,
                asset: r.asset,
                accruedAt: r.accruedAt.toISOString(),
                sourceModule: r.sourceModule,
              })),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Slice B persist: accrual tree under owner rate authority (D26-P1-O2).
       * NEVER posts ledger. Idempotent on (feeEventId, beneficiary, hop).
       * Zero fee → zero rows. Payout via ledger recipes only (Slice C).
       * Rates: owner-published IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON only —
       * per-call tiers refused (`affiliate.accrual.invent_refused`).
       */
      accrue: scopedProcedure('admin:write')
        .input(
          z.object({
            feeEventId: z.string().min(1).max(120),
            userId: z.string().uuid(),
            feeAmount: z.string().regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/),
            asset: z.string().min(1).max(32),
            /** Module fee pool that holds this fee (trade / pay / …). Default identity for legacy. */
            sourceModule: z
              .string()
              .regex(/^[a-z][a-z0-9_-]{0,31}$/)
              .optional(),
            at: z.string().datetime().optional(),
            /**
             * Forbidden on durable accrue — present only so a caller that still
             * sends invent tiers gets invent_refused rather than silent ignore.
             */
            tiers: z
              .array(
                z.object({
                  hop: z.number().int().min(0).max(20),
                  rate: z.string().regex(/^(0(\.\d{1,18})?|1(\.0{1,18})?)$/),
                }),
              )
              .max(20)
              .optional(),
          }),
        )
        .output(
          z.object({
            inserted: z.number().int(),
            rows: z.array(
              z.object({
                feeEventId: z.string(),
                beneficiaryId: z.string().uuid(),
                payerId: z.string().uuid(),
                hop: z.number().int(),
                rate: z.string(),
                feeAmount: z.string(),
                commissionAmount: z.string(),
                asset: z.string(),
                accruedAt: z.string(),
                sourceModule: z.string(),
              }),
            ),
            frozenSkipped: z.number().int(),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            const parent = await requireReferral().loadParentMap();
            const frozen = await requireFreeze().frozenIds();
            const store = requireAccruals();
            const fee = {
              feeEventId: input.feeEventId,
              userId: input.userId,
              feeAmount: input.feeAmount,
              asset: input.asset,
              sourceModule: input.sourceModule,
              at: input.at ? new Date(input.at) : new Date(),
            };
            const out = accrueTreeUnderRateAuthority({
              fee,
              parent,
              law: accrualTierLaw,
              frozenBeneficiaryIds: frozen,
              simulationTiers: input.tiers,
              mode: 'durable',
            });
            const inserted = await store.saveRows(out.rows);
            const stored = await store.listByFeeEvent(input.feeEventId);
            return {
              inserted,
              frozenSkipped: out.frozenSkipped,
              rows: stored.map((r) => ({
                feeEventId: r.feeEventId,
                beneficiaryId: r.beneficiaryId,
                payerId: r.payerId,
                hop: r.hop,
                rate: r.rate,
                feeAmount: r.feeAmount,
                commissionAmount: r.commissionAmount,
                asset: r.asset,
                accruedAt: r.accruedAt.toISOString(),
                sourceModule: r.sourceModule,
              })),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
  };
}
