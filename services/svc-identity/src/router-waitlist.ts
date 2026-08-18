import { z } from 'zod';
import { router, publicProcedure, scopedProcedure } from '@intafaced/contracts';
import type { WaitlistService } from './waitlist/waitlist-service.js';
import { toTrpcError } from './router-shared.js';

export function createWaitlistRouter(args: { requireWaitlist: () => WaitlistService }) {
  const { requireWaitlist } = args;
  return router({
    enroll: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          referralCode: z
            .string()
            .regex(/^[a-fA-F0-9]{12}$/)
            .optional(),
        }),
      )
      .output(
        z.object({
          id: z.string().uuid(),
          email: z.string(),
          position: z.number().int().positive(),
          referralCode: z.string(),
          referredCount: z.number().int().min(0),
          created: z.boolean(),
        }),
      )
      .mutation(async ({ input }) => {
        try {
          const out = await requireWaitlist().enroll(input);
          return {
            id: out.entry.id,
            email: out.entry.email,
            position: out.entry.position,
            referralCode: out.entry.referralCode,
            referredCount: out.entry.referredCount,
            created: out.created,
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    position: publicProcedure
      .input(z.object({ referralCode: z.string().regex(/^[a-fA-F0-9]{12}$/) }))
      .output(
        z.object({
          position: z.number().int().positive(),
          referralCode: z.string(),
          referredCount: z.number().int().min(0),
          queueLength: z.number().int().min(0),
        }),
      )
      .query(async ({ input }) => {
        try {
          return await requireWaitlist().position(input.referralCode);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

    list: scopedProcedure('admin:read')
      .input(
        z.object({
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .output(
        z.object({
          total: z.number().int().min(0),
          entries: z.array(
            z.object({
              id: z.string().uuid(),
              email: z.string(),
              position: z.number().int().positive(),
              referralCode: z.string(),
              referredBy: z.string().nullable(),
              referredCount: z.number().int().min(0),
              createdAt: z.string(),
            }),
          ),
        }),
      )
      .query(async ({ input }) => {
        try {
          const out = await requireWaitlist().list(input);
          return {
            total: out.total,
            entries: out.entries.map((e) => ({
              id: e.id,
              email: e.email,
              position: e.position,
              referralCode: e.referralCode,
              referredBy: e.referredBy,
              referredCount: e.referredCount,
              createdAt: e.createdAt.toISOString(),
            })),
          };
        } catch (err) {
          throw toTrpcError(err);
        }
      }),
  });
}
