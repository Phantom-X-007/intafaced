import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router, scopedProcedure } from '@intafaced/contracts';
import { SealedHouseTenantRegistry, type TenantDescribe, type TenantRefusal } from '@intafaced/execution-house-tenant';
import type { CaptureLake } from '@intafaced/venue-adapter';
import { cancelOmsOrder, type OmsCancelFn } from './oms-cancel.js';
import { killInFlightExecution } from './oms-kill.js';
import { drainInFlightAlgo } from './oms-drain.js';
import { cancelRemainingParentChildren } from './oms-cancel-remaining.js';
import { attributeChildFillsToParent } from './oms-attribute.js';
import { InMemoryAlgoPauseStore, pauseInFlightAlgo, type AlgoPauseStore } from './oms-pause.js';
import { resumeInFlightAlgo } from './oms-resume.js';
import { InMemoryApprovedAlgoParentStore, startApprovedAlgoParent, type ApprovedAlgoParentStore, type AlgoJobsGate } from './oms-start.js';
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
import { runTcaRun, TCA_BENCHMARK_CLASSES } from './oms-tca.js';
import { runTcaForParent } from './oms-tca-parent.js';
import { recordMarkoutsForParent } from './oms-tca-markouts.js';
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
  captureLake?: CaptureLake,
  pauseStore: AlgoPauseStore = new InMemoryAlgoPauseStore(),
  parentStore: ApprovedAlgoParentStore = new InMemoryApprovedAlgoParentStore(),
  algoJobs: AlgoJobsGate = { enabled: false },
) {
  return router({
    execution: router({
      oms: router({
        start: scopedProcedure('admin:write', { module: 'execution' })
          .input(z.object({ parentClientOrderId: z.string().min(1).max(200) }))
          .mutation(async ({ input }) => {
            return withExecutionSpan('execution.oms.start', input.parentClientOrderId, async () => {
              return startApprovedAlgoParent({
                parentClientOrderId: input.parentClientOrderId,
                parentStore,
                jobs: algoJobs,
              });
            });
          }),
      }),
      policy: publicProcedure.query(() => describeExecutionSpine()),
      spine: scopedProcedure('admin:read', { module: 'execution' }).query(() => describeExecutionSpine()),
    }),
  });
}

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
export type ExecutionRouter = ReturnType<typeof createExecutionRouter>;
