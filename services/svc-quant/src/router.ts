import { z } from 'zod';
import { publicJurisdictionProcedure, publicProcedure, router, TRPCError } from '@intafaced/contracts';
import type { BacktestCostModel } from '@intafaced/quant-honesty';
import { missingLake, type BacktestLake } from './backtest/lake.js';
import { runBacktest } from './backtest/run.js';
import {
  QUANT_BACKTEST_FILLS_MISSING,
  QUANT_BACKTEST_LAKE_MISSING,
  QUANT_BACKTEST_SURFACE_REFUSED,
  QUANT_BACKTEST_WALK_FORWARD_REQUIRED,
  QUANT_ENVIRONMENT_REQUIRED,
  QUANT_ENVIRONMENT_UNKNOWN,
  QUANT_SANDBOX_MAX_OPS_UNSET,
  QUANT_SANDBOX_MAX_SOURCE_UNSET,
  QUANT_SANDBOX_UNWIRED,
  QUANT_SIMULATED_AS_LIVE,
  QUANT_STUDIO_RISK_BLOCK_REQUIRED,
  QuantError,
} from './errors.js';
import { claimMarketplace } from './marketplace/claim.js';
import { sandboxSourceInputMax } from './sandbox/max.js';
import { runSandbox, type SandboxDeps } from './sandbox/run.js';
import { saveStudio } from './studio/save.js';
import { createStudioStore } from './studio/store.js';
import { withQuantSpan } from './tracing.js';

const simulatedStamp = z.object({
  environment: z.enum(['paper', 'backtest', 'shadow']),
  kind: z.enum(['paper', 'simulated']),
  claimLabel: z.enum(['Paper — not live performance', 'Historical simulation — not a forecast', 'Shadow — not live performance']),
  live: z.literal(false),
  simulated: z.literal(true),
});

const environmentInput = z.object({
  environment: z.string().optional().nullable(),
  presentedAs: z.string().optional().nullable(),
});

const decimal = z.string().regex(/^-?\d+(\.\d{1,18})?$/, 'amounts are decimal strings with at most 18 decimal places');

const language = z.enum(['javascript', 'typescript', 'python']);

const fillSchema = z.object({
  side: z.enum(['buy', 'sell']),
  symbol: z.string(),
  qty: z.string(),
  price: z.string(),
  venue: z.literal('internal'),
});

const runOutput = z
  .object({
    ok: z.literal(true),
    language,
    logs: z.array(z.string()),
    cash: z.string(),
    pnl: z.string(),
    fills: z.array(fillSchema),
    positions: z.array(z.object({ symbol: z.string(), qty: z.string() })),
    venue: z.literal('internal'),
    venueVault: z.enum(['unset', 'set']),
  })
  .merge(simulatedStamp);

function toTrpc(err: unknown): never {
  if (err instanceof QuantError) {
    const code =
      err.code === QUANT_SANDBOX_UNWIRED ||
      err.code === QUANT_SANDBOX_MAX_OPS_UNSET ||
      err.code === QUANT_SANDBOX_MAX_SOURCE_UNSET ||
      err.code === QUANT_BACKTEST_LAKE_MISSING ||
      err.code === QUANT_BACKTEST_FILLS_MISSING ||
      err.code === 'quant.venue_vault_unset'
        ? 'PRECONDITION_FAILED'
        : err.code === QUANT_STUDIO_RISK_BLOCK_REQUIRED ||
            err.code === QUANT_BACKTEST_WALK_FORWARD_REQUIRED ||
            err.code === QUANT_BACKTEST_SURFACE_REFUSED ||
            err.code === QUANT_ENVIRONMENT_REQUIRED ||
            err.code === QUANT_ENVIRONMENT_UNKNOWN ||
            err.code === QUANT_SIMULATED_AS_LIVE
          ? 'BAD_REQUEST'
          : err.code === 'quant.sandbox_timeout'
            ? 'TIMEOUT'
            : 'BAD_REQUEST';
    throw new TRPCError({ code, message: err.message, cause: err });
  }
  throw err;
}

const studioBlock = z.object({
  side: z.enum(['buy', 'sell']),
  symbol: z.string().min(1).max(32),
  qty: decimal,
});

const studioRisk = z
  .object({
    maxDrawdown: z.string().optional(),
    maxNotional: z.string().optional(),
    kill: z.string().optional(),
  })
  .optional();

const savedStrategy = z
  .object({
    id: z.string(),
    name: z.string(),
    language: z.literal('javascript'),
    source: z.string(),
    cash: z.string(),
    blocks: z.array(studioBlock),
    risk: z.object({
      maxDrawdown: z.string(),
      maxNotional: z.string(),
      kill: z.string(),
    }),
  })
  .merge(simulatedStamp);

const costEvidence = z.object({
  kind: z.string(),
  source: z.string(),
});

const backtestOutput = z
  .object({
    ok: z.literal(true),
    runId: z.string(),
    strategyId: z.string(),
    walkForward: z.object({
      inSampleFrom: z.string(),
      inSampleTo: z.string(),
      outOfSampleFrom: z.string(),
      outOfSampleTo: z.string(),
    }),
    inSample: z.object({ fillCount: z.number().int(), notional: decimal }),
    outOfSample: z.object({ fillCount: z.number().int(), notional: decimal }),
    claimLabel: z.literal('Historical simulation — not a forecast'),
    outOfSampleLabel: z.string(),
  })
  .merge(simulatedStamp);

export interface QuantRouterDeps extends SandboxDeps {
  readonly lake?: BacktestLake;
}

export function createQuantRouter(deps: QuantRouterDeps) {
  const studio = createStudioStore();
  const lake = deps.lake ?? missingLake();
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.literal(true), service: z.literal('svc-quant'), custodial: z.literal(false) }))
      .query(() => ({ ok: true as const, service: 'svc-quant' as const, custodial: false as const })),

    studio: router({
      save: publicJurisdictionProcedure('quant', 'fiat')
        .input(
          z
            .object({
              name: z.string().min(1).max(128),
              blocks: z.array(studioBlock).min(1),
              risk: studioRisk,
              cash: decimal.default('10000'),
            })
            .merge(environmentInput),
        )
        .output(savedStrategy)
        .mutation(async ({ input }) =>
          withQuantSpan('quant.studio.save', { language: 'javascript' }, async () => {
            try {
              return saveStudio(input, studio);
            } catch (err) {
              toTrpc(err);
            }
          }),
        ),

      list: publicJurisdictionProcedure('quant', 'fiat')
        .output(z.object({ strategies: z.array(savedStrategy) }))
        .query(() => ({ strategies: [...studio.list()] })),
    }),

    backtest: router({
      run: publicJurisdictionProcedure('quant', 'fiat')
        .input(
          z
            .object({
              strategyId: z.string(),
              symbol: z.string(),
              walkForward: z
                .object({
                  inSampleFrom: z.string().optional(),
                  inSampleTo: z.string().optional(),
                  outOfSampleFrom: z.string().optional(),
                  outOfSampleTo: z.string().optional(),
                })
                .optional()
                .nullable(),
              outOfSampleStatus: z.enum(['passed', 'failed', 'inconclusive']).optional().nullable(),
              costModel: z
                .object({
                  fees: costEvidence.optional().nullable(),
                  slippage: costEvidence.optional().nullable(),
                  latency: costEvidence.optional().nullable(),
                })
                .optional()
                .nullable(),
              strategyVariantCount: z.number().int().optional(),
            })
            .merge(environmentInput),
        )
        .output(backtestOutput)
        .mutation(async ({ input }) =>
          withQuantSpan('quant.backtest.run', { language: 'fills' }, async () => {
            try {
              return runBacktest(
                {
                  strategyId: input.strategyId,
                  symbol: input.symbol,
                  walkForward: input.walkForward,
                  outOfSampleStatus: input.outOfSampleStatus,
                  costModel: input.costModel as BacktestCostModel | null | undefined,
                  strategyVariantCount: input.strategyVariantCount,
                  environment: input.environment,
                  presentedAs: input.presentedAs,
                },
                lake,
              );
            } catch (err) {
              toTrpc(err);
            }
          }),
        ),
    }),

    sandbox: router({
      capabilities: publicJurisdictionProcedure('quant', 'fiat').query(() => ({
        isolate: deps.wired ? ('wired' as const) : ('unwired' as const),
        languages: ['javascript', 'typescript', 'python'] as const,
        venueVault: deps.venueVaultSet ? ('trade-only' as const) : ('unset' as const),
        refuse: deps.wired ? null : QUANT_SANDBOX_UNWIRED,
      })),

      run: publicJurisdictionProcedure('quant', 'fiat')
        .input(
          z
            .object({
              language,
              source: z.string().min(1).max(sandboxSourceInputMax(deps.limits.maxSource)),
              cash: decimal.default('10000'),
            })
            .merge(environmentInput),
        )
        .output(runOutput)
        .mutation(async ({ input }) =>
          withQuantSpan('quant.sandbox.run', { language: input.language }, async () => {
            try {
              return runSandbox(input, deps);
            } catch (err) {
              toTrpc(err);
            }
          }),
        ),
    }),

    marketplace: router({
      claim: publicJurisdictionProcedure('quant', 'fiat')
        .input(
          z
            .object({
              strategyId: z.string().min(1),
              pnl: decimal.optional(),
            })
            .merge(environmentInput),
        )
        .output(
          simulatedStamp.extend({
            ok: z.literal(true),
            strategyId: z.string(),
            pnl: decimal.optional(),
          }),
        )
        .mutation(async ({ input }) =>
          withQuantSpan('quant.marketplace.claim', { language: 'claim' }, async () => {
            try {
              return claimMarketplace(input);
            } catch (err) {
              toTrpc(err);
            }
          }),
        ),
    }),
  });
}

export type QuantRouter = ReturnType<typeof createQuantRouter>;
