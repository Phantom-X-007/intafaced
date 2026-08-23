import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router, scopedProcedure } from '@intafaced/contracts';
import { TAX_JURISDICTION_UNMAPPED, TaxError } from './codes.js';
import { LOT_METHODS } from './lots.js';
import type { TaxService } from './tax-service.js';

const lotMethod = z.enum(LOT_METHODS);

const lakeSchema = z.object({
  status: z.enum(['ok', 'absent']),
  code: z.string().optional(),
});

const previewSchema = z.object({
  empty: z.boolean(),
  lotMethod,
  jurisdiction: z.string(),
  lotCount: z.number().int().nonnegative(),
  realized: z.string().nullable(),
  unrealized: z.string().nullable(),
  lake: lakeSchema,
  indexer: lakeSchema,
  residuals: z.array(z.string()),
});

const packSchema = previewSchema.extend({
  filename: z.string().min(1),
  mime: z.literal('application/json'),
  bodyBase64: z.string().min(1),
});

function mapError(err: unknown): never {
  if (err instanceof TaxError) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.code} — ${err.message}`,
      cause: err,
    });
  }
  throw err;
}

export function createTaxRouter(tax: TaxService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.literal(true), service: z.literal('svc-tax'), custodial: z.literal(false) }))
      .query(() => ({ ok: true as const, service: 'svc-tax' as const, custodial: false as const })),

    exportPreview: scopedProcedure('tax:read', { module: 'tax', plane: 'fiat' })
      .input(z.object({ lotMethod }))
      .output(previewSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await tax.exportPreview({
            userId: ctx.principal!.userId,
            region: ctx.region,
            lotMethod: input.lotMethod,
          });
        } catch (err) {
          mapError(err);
        }
      }),

    exportPack: scopedProcedure('tax:read', { module: 'tax', plane: 'fiat' })
      .input(z.object({ lotMethod }))
      .output(packSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await tax.exportPack({
            userId: ctx.principal!.userId,
            region: ctx.region,
            lotMethod: input.lotMethod,
          });
        } catch (err) {
          mapError(err);
        }
      }),
  });
}

export type TaxRouter = ReturnType<typeof createTaxRouter>;

/** Grep anchor for the shell golden / Portfolio card. */
export const UNMAPPED_REFUSE = TAX_JURISDICTION_UNMAPPED;
