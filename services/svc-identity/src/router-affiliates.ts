import { z } from 'zod';
import { router, scopedProcedure } from '@intafaced/contracts';
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

export function createAffiliatesRouter(args: {
  requireReferral: () => ReferralService;
  requireFreeze: () => FreezeService;
  requireAccruals: () => AccrualStore;
  freeze: FreezeService | undefined;
  accrualTierLaw: AccrualTierLaw;
  ledger: Pick<LedgerClient, 'post'> | undefined;
}) {
  const { requireReferral, requireFreeze, requireAccruals, freeze, accrualTierLaw, ledger } = args;
  return router({
      attribute: scopedProcedure('identity:write')
        .input(z.object({ referrerId: z.string().uuid() }))
        .output(
          z.object({
            userId: z.string().uuid(),
            referrerId: z.string().uuid(),
            attributedAt: z.string(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          try {
            const edge = await requireReferral().attribute({
              userId: ctx.principal.userId,
              referrerId: input.referrerId,
            });
            return {
              userId: edge.userId,
              referrerId: edge.referrerId,
              attributedAt: edge.attributedAt.toISOString(),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      myReferrer: scopedProcedure('identity:read')
        .output(
          z
            .object({
              userId: z.string().uuid(),
              referrerId: z.string().uuid(),
              attributedAt: z.string(),
            })
            .nullable(),
        )
        .query(async ({ ctx }) => {
          try {
            const edge = await requireReferral().edgeOf(ctx.principal.userId);
            if (!edge) return null;
            return {
              userId: edge.userId,
              referrerId: edge.referrerId,
              attributedAt: edge.attributedAt.toISOString(),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      myAncestors: scopedProcedure('identity:read')
        .output(z.array(z.string().uuid()))
        .query(async ({ ctx }) => {
          try {
            return await requireReferral().ancestorsOf(ctx.principal.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Affiliate self-view of durable commission accruals only.
       * Always scoped to ctx.principal.userId — no beneficiaryId input (foreign refuse by design).
       * Empty list when no rows / rates unpublished (never invents rates or amounts).
       * Payout is a separate admin procedure (affiliates.payout) — refuse-closed without owner rates + ledger.
       */
      myAccruals: scopedProcedure('identity:read')
        .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
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
          }),
        )
        .query(async ({ ctx, input }) => {
          try {
            const store = requireAccruals();
            // Self-only: never accept a foreign beneficiaryId.
            const rows = await store.listByBeneficiary(ctx.principal.userId, input?.limit);
            return {
              rows: rows.map((r) => ({
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

      /** Operator freeze beneficiary — skips accrual; no payout path here. */
      freeze: scopedProcedure('admin:write')
        .input(z.object({ beneficiaryId: z.string().uuid(), reason: z.string().min(3).max(500) }))
        .output(
          z.object({
            beneficiaryId: z.string().uuid(),
            frozenBy: z.string().uuid(),
            reason: z.string(),
            frozenAt: z.string(),
            honestyLine: z.string(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          try {
            const svc = requireFreeze();
            const rec = await svc.freeze({
              beneficiaryId: input.beneficiaryId,
              frozenBy: ctx.principal.userId,
              reason: input.reason,
            });
            const frozenIds = await svc.frozenIds();
            return {
              beneficiaryId: rec.beneficiaryId,
              frozenBy: rec.frozenBy,
              reason: rec.reason,
              frozenAt: rec.frozenAt.toISOString(),
              honestyLine: affiliateFreezeHonestyLine({
                beneficiaryId: rec.beneficiaryId,
                frozenIds,
                action: 'freeze',
              }),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      unfreeze: scopedProcedure('admin:write')
        .input(z.object({ beneficiaryId: z.string().uuid() }))
        .output(
          z.object({
            beneficiaryId: z.string().uuid(),
            frozenBy: z.string().uuid(),
            reason: z.string(),
            frozenAt: z.string(),
            honestyLine: z.string(),
          }),
        )
        .mutation(async ({ input }) => {
          try {
            const svc = requireFreeze();
            const rec = await svc.unfreeze(input.beneficiaryId);
            const frozenIds = await svc.frozenIds();
            return {
              beneficiaryId: rec.beneficiaryId,
              frozenBy: rec.frozenBy,
              reason: rec.reason,
              frozenAt: rec.frozenAt.toISOString(),
              honestyLine: affiliateFreezeHonestyLine({
                beneficiaryId: rec.beneficiaryId,
                frozenIds,
                action: 'unfreeze',
              }),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      freezes: scopedProcedure('admin:read')
        .output(
          z.array(
            z.object({
              beneficiaryId: z.string().uuid(),
              frozenBy: z.string().uuid(),
              reason: z.string(),
              frozenAt: z.string(),
            }),
          ),
        )
        .query(async () => {
          try {
            const rows = await requireFreeze().list();
            return rows.map((r) => ({
              beneficiaryId: r.beneficiaryId,
              frozenBy: r.frozenBy,
              reason: r.reason,
              frozenAt: r.frozenAt.toISOString(),
            }));
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Stage admin read — multi-tier tree board (structure + freeze count) plus
       * D26-P1-O2 rate-authority honesty. Never invents commission % into the board.
       */
      treeStatus: scopedProcedure('admin:read')
        .output(
          z.object({
            edges: z.number().int().nonnegative(),
            referrers: z.number().int().nonnegative(),
            maxDepth: z.number().int().nonnegative(),
            frozenCount: z.number().int().nonnegative(),
            maxDepthCap: z.number().int().positive(),
            statusLine: z.string(),
            /** Owner published IDENTITY_AFFILIATE_ACCRUAL_TIERS_JSON (no invent). */
            rateAuthorityPublished: z.boolean(),
            /** Ops board line — published flag + tier count only, never rate values. */
            rateAuthorityStatusLine: z.string(),
          }),
        )
        .query(async () => {
          try {
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();
            const board = await requireReferral().treeBoard(frozen);
            return {
              ...board,
              statusLine: affiliateTreeStatusLine(board),
              rateAuthorityPublished: accrualTierLawIsPublished(accrualTierLaw),
              rateAuthorityStatusLine: accrualTreeAuthorityStatusLine(accrualTierLaw),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Stage admin read — one node's place in the IB / affiliate tree.
       * Structure + freeze flag only.
       */
      node: scopedProcedure('admin:read')
        .input(z.object({ userId: z.string().uuid() }))
        .output(
          z.object({
            userId: z.string().uuid(),
            referrerId: z.string().uuid().nullable(),
            depth: z.number().int().nonnegative(),
            ancestors: z.array(z.string().uuid()),
            directDownline: z.array(z.string().uuid()),
            directDownlineCount: z.number().int().nonnegative(),
            frozen: z.boolean(),
            attributedAt: z.string().nullable(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();
            const node = await requireReferral().nodeStatus(input.userId, frozen);
            return {
              userId: node.userId,
              referrerId: node.referrerId,
              depth: node.depth,
              ancestors: [...node.ancestors],
              directDownline: [...node.directDownline],
              directDownlineCount: node.directDownlineCount,
              frozen: node.frozen,
              attributedAt: node.attributedAt,
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Stage-2 admin read — attributed member roster (+ optional root filter).
       * Structure + freeze overlay only; no rates / payouts.
       */
      members: scopedProcedure('admin:read')
        .input(z.object({ rootId: z.string().uuid().optional() }).optional())
        .output(
          z.object({
            members: z.array(
              z.object({
                userId: z.string().uuid(),
                referrerId: z.string().uuid(),
                depth: z.number().int().nonnegative(),
                frozen: z.boolean(),
                attributedAt: z.string().nullable(),
              }),
            ),
            total: z.number().int().nonnegative(),
            frozenInList: z.number().int().nonnegative(),
            maxDepthInList: z.number().int().nonnegative(),
            rootId: z.string().uuid().nullable(),
            statusLine: z.string(),
          }),
        )
        .query(async ({ input }) => {
          try {
            const frozen = freeze ? await requireFreeze().frozenIds() : new Set<string>();
            const rootId = input?.rootId ?? null;
            const { members, board } = await requireReferral().listMembers(frozen, rootId);
            return {
              members: members.map((m) => ({
                userId: m.userId,
                referrerId: m.referrerId,
                depth: m.depth,
                frozen: m.frozen,
                attributedAt: m.attributedAt,
              })),
              total: board.total,
              frozenInList: board.frozenInList,
              maxDepthInList: board.maxDepthInList,
              rootId: board.rootId,
              statusLine: affiliateMemberListStatusLine(board),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Slice C payout — the mechanism is here and it is REFUSE-CLOSED ON THE RATE.
       *
       * DIRECTION §8 rates stay owner-only, so with an unpublished law this
       * refuses `affiliate.payout.rates_unset` and moves nothing. When the owner
       * publishes tiers, the same path fans the durable accrual rows out across
       * the tree through existing ledger recipes (§0.6 — no value moves outside
       * packages/ledger-client, and no recipe is invented here).
       *
       * `feeEventId` is OPTIONAL IN THE SCHEMA ON PURPOSE: the rate refusal must
       * be the one an operator sees first. Rejecting a missing field before
       * checking the law would answer "your request is malformed" to someone
       * whose real problem is that no rate exists.
       */
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
  });
}
