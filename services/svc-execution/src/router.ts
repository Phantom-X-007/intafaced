import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router, scopedProcedure } from '@intafaced/contracts';
import { SealedHouseTenantRegistry, type TenantDescribe, type TenantRefusal } from '@intafaced/execution-house-tenant';
import { cancelOmsOrder, type OmsCancelFn } from './oms-cancel.js';
import { executeOmsRoute, type OmsSubmitFn } from './oms-execute.js';
import { fetchOmsOrder, type OmsFetchFn } from './oms-fetch.js';
import { listOmsOpenOrders, type OmsOpenOrdersFn } from './oms-open-orders.js';
import { observeOmsBalances, type OmsBalancesFn } from './oms-balances.js';
import { observeOmsPositions, type OmsPositionsFn } from './oms-positions.js';
import { observeOmsBorrow, type OmsBorrowFn } from './oms-borrow.js';
import { observeOmsFunding, type OmsFundingFn } from './oms-funding.js';
import { observeOmsLatency, type OmsLatencyFn } from './oms-latency.js';
import { observeOmsMarkets, type OmsMarketsFn } from './oms-markets.js';
import { observeOmsRails, type OmsRailsFn } from './oms-rails.js';
import { observeOmsSnapshot, type OmsSnapshotFn } from './oms-snapshot.js';
import { scanOmsExternalArb } from './oms-arbitrage.js';
import { planOmsArbAtomicLegs } from './oms-arb-plan-legs.js';
import { executeOmsArbAtomicLegs } from './oms-arb-execute-legs.js';
import { describeExecutionSpine } from './oms-spine.js';
import { planOmsExternalMmHedge, quoteOmsExternalMm } from './oms-market-making.js';
import { planOmsRoute } from './oms-plan.js';
import { withExecutionSpan } from './tracing.js';
import type { EmsOrderStore } from './oms-ems-store.js';

const tenantIdInput = z.object({ tenantId: z.string().min(1).max(128) });

const describeOutput = z.union([
  z.object({
    tenantId: z.string(),
    keyNamespace: z.string(),
    killed: z.boolean(),
    auditCount: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['internal_venue', 'kill_switch', 'unknown_tenant', 'invalid_venue']),
    detail: z.string(),
  }),
]);

function isRefusal(value: TenantDescribe | TenantRefusal): value is TenantRefusal {
  return 'ok' in value && value.ok === false;
}

const decimalString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are positive decimal strings');
const signedDecimalString = z.string().regex(/^-?\d+(\.\d{1,18})?$/, 'amounts are signed decimal strings');

const latencyGradeInput = z.object({
  venueId: z.string().min(1),
  measurement: z.literal('rest-round-trip'),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']).nullable(),
  samples: z.number().int().nonnegative(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  rejectRateBps: z.number().nullable(),
  errorRateBps: z.number().nullable(),
  staleMs: z.number().nullable(),
  provisional: z.boolean(),
  reasons: z.array(z.string()).readonly(),
});

const omsVenueInput = z.object({
  id: z.string().min(1).max(128),
  kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']),
  price: decimalString,
  amount: decimalString,
  feeBps: z.number().int().nonnegative(),
  costTerms: z.object({
    feeBps: z.number().nullable(),
    expectedImpactBps: z.number().nullable(),
    transferCostBps: z.number().nullable(),
    latencyGrade: latencyGradeInput.nullable(),
  }),
});

const omsPlanInput = z.object({
  symbol: z.string().min(1).max(64),
  side: z.enum(['buy', 'sell']),
  amount: decimalString,
  venues: z.array(omsVenueInput).min(1).max(16),
  tenantId: z.string().min(1).max(128).optional(),
  parentClientOrderId: z.string().min(1).max(128).optional(),
  executionGroupId: z.string().min(1).max(128).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

const sorCostTermsInput = z.object({
  feeBps: z.number().nullable(),
  expectedImpactBps: z.number().nullable(),
  transferCostBps: z.number().nullable(),
  latencyGrade: latencyGradeInput.nullable(),
});

const omsArbScanInput = z.object({
  symbol: z.string().min(1).max(64),
  amount: decimalString,
  scanClass: z.enum(['cross-exchange', 'triangular', 'basis', 'funding']).default('cross-exchange'),
  fundingRate: z.string().max(64).nullable().optional(),
  quotes: z
    .array(
      z.object({
        venueId: z.string().min(1).max(128),
        kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']),
        price: decimalString.nullable(),
        amount: decimalString,
        asOfMs: z.number().int().nullable(),
      }),
    )
    .max(32),
  costTermsByVenue: z.record(z.string().min(1).max(128), sorCostTermsInput),
  inventory: z.object({
    prePositionedByVenue: z.record(z.string().min(1).max(128), z.boolean()),
  }),
  nowMs: z.number().int(),
  maxQuoteAgeMs: z.number().int().nonnegative().nullable(),
});

const omsArbPlanLegsInput = z.object({
  symbol: z.string().min(1).max(64),
  amount: decimalString,
  buyVenueId: z.string().min(1).max(128),
  sellVenueId: z.string().min(1).max(128),
  inventory: z.object({
    prePositionedByVenue: z.record(z.string().min(1).max(128), z.boolean()),
  }),
});

const omsArbExecuteLegsInput = omsArbPlanLegsInput.extend({
  parentClientOrderId: z.string().min(1).max(128),
  executionGroupId: z.string().min(1).max(128).optional(),
  buyLimitPrice: decimalString,
  sellLimitPrice: decimalString,
});

const omsMmInventoryInput = z.object({
  position: signedDecimalString,
  minPosition: signedDecimalString,
  maxPosition: signedDecimalString,
});

const omsMmKillInput = z.object({
  adminKill: z.boolean(),
  inventory: omsMmInventoryInput,
  volatility: z.object({
    realizedVolBps: z.number().int().nullable(),
    maxVolBps: z.number().int(),
  }),
});

const omsMmQuoteInput = z.object({
  symbol: z.string().min(1).max(64),
  venueId: z.string().min(1).max(128),
  kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']),
  midKind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
  mid: decimalString.nullable(),
  book: z
    .object({
      bidSize: decimalString,
      askSize: decimalString,
    })
    .nullable(),
  quoteSize: decimalString,
  halfSpreadBps: z.number().int().nonnegative(),
  inventorySkewBps: z.number().int(),
  costTerms: sorCostTermsInput,
  kill: omsMmKillInput,
});

const omsMmHedgeInput = z.object({
  symbol: z.string().min(1).max(64),
  quoteVenueId: z.string().min(1).max(128),
  inventory: omsMmInventoryInput,
  kill: omsMmKillInput,
  hedge: z.object({
    venueId: z.string().min(1).max(128),
    kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']),
    midKind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
    mid: decimalString.nullable(),
    costTerms: sorCostTermsInput,
    availableSize: decimalString,
  }),
});

export type ExecutionSubmitMap = Readonly<Record<string, OmsSubmitFn>>;
export type ExecutionCancelMap = Readonly<Record<string, OmsCancelFn>>;
export type ExecutionFetchMap = Readonly<Record<string, OmsFetchFn>>;
export type ExecutionOpenOrdersMap = Readonly<Record<string, OmsOpenOrdersFn>>;
export type ExecutionBalancesMap = Readonly<Record<string, OmsBalancesFn>>;
export type ExecutionPositionsMap = Readonly<Record<string, OmsPositionsFn>>;
export type ExecutionRailsMap = Readonly<Record<string, OmsRailsFn>>;
export type ExecutionFundingMap = Readonly<Record<string, OmsFundingFn>>;
export type ExecutionBorrowMap = Readonly<Record<string, OmsBorrowFn>>;
export type ExecutionLatencyMap = Readonly<Record<string, OmsLatencyFn>>;
export type ExecutionMarketsMap = Readonly<Record<string, OmsMarketsFn>>;
export type ExecutionSnapshotMap = Readonly<Record<string, OmsSnapshotFn>>;

export function createExecutionRouter(
  registry: SealedHouseTenantRegistry,
  submitByVenue: ExecutionSubmitMap = {},
  cancelByVenue: ExecutionCancelMap = {},
  fetchByVenue: ExecutionFetchMap = {},
  openOrdersByVenue: ExecutionOpenOrdersMap = {},
  balancesByVenue: ExecutionBalancesMap = {},
  positionsByVenue: ExecutionPositionsMap = {},
  railsByVenue: ExecutionRailsMap = {},
  fundingByVenue: ExecutionFundingMap = {},
  borrowByVenue: ExecutionBorrowMap = {},
  latencyByVenue: ExecutionLatencyMap = {},
  marketsByVenue: ExecutionMarketsMap = {},
  snapshotByVenue: ExecutionSnapshotMap = {},
  emsStore?: EmsOrderStore,
) {
  return router({
    execution: router({
      tenant: router({
        describe: scopedProcedure('admin:read', { module: 'execution' })
          .input(tenantIdInput)
          .output(describeOutput)
          .query(async ({ input }) => {
            return withExecutionSpan('execution.tenant.describe', input.tenantId, async () => {
              const result = registry.describe(input.tenantId);
              if (isRefusal(result)) return result;
              return result;
            });
          }),

        kill: scopedProcedure('admin:write', { module: 'execution' })
          .input(tenantIdInput)
          .mutation(async ({ ctx, input }) => {
            return withExecutionSpan('execution.tenant.kill', input.tenantId, async () => {
              const existing = registry.get(input.tenantId);
              if (!existing) {
                const created = registry.register(input.tenantId, ctx.principal!.userId);
                if ('ok' in created && created.ok === false) {
                  throw new TRPCError({ code: 'BAD_REQUEST', message: created.detail });
                }
              }
              const result = registry.kill(input.tenantId, ctx.principal!.userId);
              if ('ok' in result && result.ok === false) {
                throw new TRPCError({ code: 'NOT_FOUND', message: result.detail });
              }
              return result;
            });
          }),
      }),

      oms: router({
        plan: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsPlanInput)
          .mutation(async ({ ctx, input }) => {
            return withExecutionSpan('execution.oms.plan', input.tenantId ?? 'none', async () => {
              return planOmsRoute(
                {
                  symbol: input.symbol,
                  side: input.side,
                  amount: input.amount,
                  venues: input.venues,
                  tenantId: input.tenantId,
                  actor: ctx.principal!.userId,
                },
                registry,
              );
            });
          }),

        execute: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsPlanInput)
          .mutation(async ({ ctx, input }) => {
            return withExecutionSpan('execution.oms.execute', input.tenantId ?? 'none', async () => {
              return executeOmsRoute(
                {
                  symbol: input.symbol,
                  side: input.side,
                  amount: input.amount,
                  venues: input.venues,
                  tenantId: input.tenantId,
                  actor: ctx.principal!.userId,
                  parentClientOrderId: input.parentClientOrderId,
                  executionGroupId: input.executionGroupId,
                  idempotencyKey: input.idempotencyKey,
                  submitByVenue,
                  emsStore,
                },
                registry,
              );
            });
          }),

        cancel: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              symbol: z.string().min(1).max(64),
              clientOrderId: z.string().min(1).max(128),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.oms.cancel', input.venueId, async () => {
              return cancelOmsOrder({
                venueId: input.venueId,
                symbol: input.symbol,
                clientOrderId: input.clientOrderId,
                kind: input.kind,
                cancelByVenue,
                emsStore,
              });
            });
          }),

        fetch: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              symbol: z.string().min(1).max(64),
              clientOrderId: z.string().min(1).max(128),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.fetch', input.venueId, async () => {
              return fetchOmsOrder({
                venueId: input.venueId,
                symbol: input.symbol,
                clientOrderId: input.clientOrderId,
                kind: input.kind,
                fetchByVenue,
                emsStore,
              });
            });
          }),

        openOrders: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              symbol: z.string().min(1).max(64).optional(),
              side: z.enum(['buy', 'sell']).optional(),
              type: z.enum(['limit', 'market']).optional(),
              clientOrderId: z.string().min(1).max(128).optional(),
              venueOrderId: z.string().min(1).max(128).optional(),
              feeAsset: z.string().min(1).max(32).optional(),
              status: z.enum(['open', 'partially_filled']).optional(),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.openOrders', input.venueId, async () => {
              return listOmsOpenOrders({
                venueId: input.venueId,
                symbol: input.symbol,
                side: input.side,
                type: input.type,
                clientOrderId: input.clientOrderId,
                venueOrderId: input.venueOrderId,
                feeAsset: input.feeAsset,
                status: input.status,
                kind: input.kind,
                openOrdersByVenue,
              });
            });
          }),

        balances: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              asset: z.string().min(1).max(32).optional(),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.balances', input.venueId, async () => {
              return observeOmsBalances({
                venueId: input.venueId,
                asset: input.asset,
                kind: input.kind,
                balancesByVenue,
              });
            });
          }),

        positions: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              symbol: z.string().min(1).max(64).optional(),
              side: z.enum(['long', 'short']).optional(),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.positions', input.venueId, async () => {
              return observeOmsPositions({
                venueId: input.venueId,
                symbol: input.symbol,
                side: input.side,
                kind: input.kind,
                positionsByVenue,
              });
            });
          }),

        rails: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              asset: z.string().min(1).max(32),
              enabled: z.boolean().optional(),
              network: z.string().min(1).max(32).optional(),
              toVenueId: z.string().min(1).max(128).optional(),
              fromVenueId: z.string().min(1).max(128).optional(),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.rails', input.venueId, async () => {
              return observeOmsRails({
                venueId: input.venueId,
                asset: input.asset,
                enabled: input.enabled,
                network: input.network,
                toVenueId: input.toVenueId,
                fromVenueId: input.fromVenueId,
                kind: input.kind,
                railsByVenue,
              });
            });
          }),

        funding: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              symbol: z.string().min(1).max(64),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.funding', input.venueId, async () => {
              return observeOmsFunding({
                venueId: input.venueId,
                symbol: input.symbol,
                kind: input.kind,
                fundingByVenue,
              });
            });
          }),

        borrow: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              asset: z.string().min(1).max(32),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.borrow', input.venueId, async () => {
              return observeOmsBorrow({
                venueId: input.venueId,
                asset: input.asset,
                kind: input.kind,
                borrowByVenue,
              });
            });
          }),

        latency: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
              now: z.coerce.date().optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.latency', input.venueId, async () => {
              return observeOmsLatency({
                venueId: input.venueId,
                kind: input.kind,
                now: input.now,
                latencyByVenue,
              });
            });
          }),

        markets: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              type: z.enum(['spot', 'perpetual', 'future', 'option', 'margin', 'fx', 'cfd']).optional(),
              quote: z.string().min(1).max(32).optional(),
              base: z.string().min(1).max(32).optional(),
              active: z.boolean().optional(),
              settle: z.string().min(1).max(32).optional(),
              symbol: z.string().min(1).max(64).optional(),
              venueSymbol: z.string().min(1).max(64).optional(),
              expiry: z.coerce.date().optional(),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.markets', input.venueId, async () => {
              return observeOmsMarkets({
                venueId: input.venueId,
                type: input.type,
                quote: input.quote,
                base: input.base,
                active: input.active,
                settle: input.settle,
                symbol: input.symbol,
                venueSymbol: input.venueSymbol,
                expiry: input.expiry,
                kind: input.kind,
                marketsByVenue,
              });
            });
          }),

        snapshot: scopedProcedure('admin:write', { module: 'execution' })
          .input(
            z.object({
              venueId: z.string().min(1).max(128),
              symbol: z.string().min(1).max(64),
              limit: z.number().int().positive().max(1000).optional(),
              kind: z.enum(['internal', 'external-cex', 'external-dex', 'amm', 'otc']).optional(),
            }),
          )
          .query(async ({ input }) => {
            return withExecutionSpan('execution.oms.snapshot', input.venueId, async () => {
              return observeOmsSnapshot({
                venueId: input.venueId,
                symbol: input.symbol,
                limit: input.limit,
                kind: input.kind,
                snapshotByVenue,
              });
            });
          }),

        ems: router({
          list: scopedProcedure('admin:read', { module: 'execution' })
            .input(
              z.object({
                venueId: z.string().min(1).max(128).optional(),
                symbol: z.string().min(1).max(64).optional(),
                executionGroupId: z.string().min(1).max(200).optional(),
                parentClientOrderId: z.string().min(1).max(200).optional(),
                state: z.enum(['ACKNOWLEDGED', 'REJECTED', 'UNWIRED', 'SUBMIT_UNKNOWN', 'OUTCOME_UNKNOWN']).optional(),
                reconciliationKey: z.string().min(1).max(300).optional(),
              }),
            )
            .query(async ({ input }) => {
              if (!emsStore) {
                throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'EMS store is not wired on this host' });
              }
              return withExecutionSpan('execution.oms.ems.list', input.venueId ?? 'all', async () =>
                emsStore.list({
                  venueId: input.venueId,
                  symbol: input.symbol,
                  executionGroupId: input.executionGroupId,
                  parentClientOrderId: input.parentClientOrderId,
                  state: input.state,
                  reconciliationKey: input.reconciliationKey,
                }),
              );
            }),

          get: scopedProcedure('admin:read', { module: 'execution' })
            .input(
              z
                .object({
                  clientOrderId: z.string().min(1).max(200).optional(),
                  reconciliationKey: z.string().min(1).max(300).optional(),
                })
                .refine(
                  (input) => Boolean(input.clientOrderId || input.reconciliationKey),
                  'clientOrderId or reconciliationKey is required',
                ),
            )
            .query(async ({ input }) => {
              if (!emsStore) {
                throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'EMS store is not wired on this host' });
              }
              const lookupKey = input.clientOrderId ?? input.reconciliationKey!;
              return withExecutionSpan('execution.oms.ems.get', lookupKey, async () => {
                const row = input.clientOrderId
                  ? emsStore.get(input.clientOrderId)
                  : emsStore.getByReconciliationKey(input.reconciliationKey!);
                if (!row) {
                  throw new TRPCError({ code: 'NOT_FOUND', message: `EMS evidence not found for ${lookupKey}` });
                }
                return row;
              });
            }),
        }),
      }),

      policy: publicProcedure.query(() => describeExecutionSpine()),

      spine: scopedProcedure('admin:read', { module: 'execution' }).query(() => describeExecutionSpine()),

      arb: router({
        scan: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsArbScanInput)
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.arb.scan', input.symbol, async () => scanOmsExternalArb(input));
          }),
        planLegs: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsArbPlanLegsInput)
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.arb.planLegs', input.symbol, async () => planOmsArbAtomicLegs(input));
          }),
        executeLegs: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsArbExecuteLegsInput)
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.arb.executeLegs', input.symbol, async () =>
              executeOmsArbAtomicLegs(input, submitByVenue, emsStore),
            );
          }),
      }),

      mm: router({
        quote: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsMmQuoteInput)
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.mm.quote', input.venueId, async () => quoteOmsExternalMm(input));
          }),

        hedge: scopedProcedure('admin:write', { module: 'execution' })
          .input(omsMmHedgeInput)
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.mm.hedge', input.quoteVenueId, async () => planOmsExternalMmHedge(input));
          }),
      }),
    }),
  });
}

export type ExecutionRouter = ReturnType<typeof createExecutionRouter>;
