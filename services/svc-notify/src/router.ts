import { z } from 'zod';
import { router, publicProcedure, scopedProcedure } from '@intafaced/contracts';
import type { NotifyService } from './notify-service.js';
import type { Notification } from './store.js';

/**
 * svc-notify API — in-app inbox.
 *
 * Every procedure operates on `ctx.principal.userId` and never on a userId from
 * input. Mark-read of another account's ids is a silent no-op at the store
 * (self-only), and the router never accepts a target userId.
 *
 * `notify` is non-custodial and `minTier: 'none'` — the guard's job is scope
 * and region, not verification.
 */

const severitySchema = z.enum(['info', 'action', 'critical']);

const notificationOutput = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  kind: z.string(),
  titleKey: z.string(),
  bodyKey: z.string(),
  params: z.record(z.unknown()),
  href: z.string().nullable(),
  severity: severitySchema,
  readAt: z.string().nullable(),
  sourceSubject: z.string(),
  sourceIdempotencyKey: z.string(),
  createdAt: z.string(),
});

function toWire(n: Notification) {
  return {
    id: n.id,
    userId: n.userId,
    kind: n.kind,
    titleKey: n.titleKey,
    bodyKey: n.bodyKey,
    params: n.params,
    href: n.href,
    severity: n.severity,
    readAt: n.readAt?.toISOString() ?? null,
    sourceSubject: n.sourceSubject,
    sourceIdempotencyKey: n.sourceIdempotencyKey,
    createdAt: n.createdAt.toISOString(),
  };
}

export function createNotifyRouter(notify: NotifyService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-notify'), fanoutEnabled: z.boolean() }))
      .query(() => ({ ok: true, service: 'svc-notify' as const, fanoutEnabled: notify.fanoutEnabled })),

    notify: router({
      list: scopedProcedure('notify:read', { module: 'notify' })
        .input(
          z
            .object({
              cursor: z.string().uuid().optional(),
              limit: z.number().int().min(1).max(100).optional(),
              unreadOnly: z.boolean().optional(),
            })
            .optional(),
        )
        .output(
          z.object({
            items: z.array(notificationOutput),
            nextCursor: z.string().uuid().nullable(),
          }),
        )
        .query(async ({ ctx, input }) => {
          const result = await notify.list({
            userId: ctx.principal.userId,
            cursor: input?.cursor ?? null,
            limit: input?.limit ?? 20,
            unreadOnly: input?.unreadOnly ?? false,
          });
          return {
            items: result.items.map(toWire),
            nextCursor: result.nextCursor,
          };
        }),

      unreadCount: scopedProcedure('notify:read', { module: 'notify' })
        .output(z.object({ count: z.number().int().nonnegative() }))
        .query(async ({ ctx }) => ({ count: await notify.unreadCount(ctx.principal.userId) })),

      markRead: scopedProcedure('notify:write', { module: 'notify' })
        .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
        .output(z.object({ marked: z.number().int().nonnegative() }))
        .mutation(async ({ ctx, input }) => ({
          marked: await notify.markRead(ctx.principal.userId, input.ids),
        })),

      markAllRead: scopedProcedure('notify:write', { module: 'notify' })
        .output(z.object({ marked: z.number().int().nonnegative() }))
        .mutation(async ({ ctx }) => ({
          marked: await notify.markAllRead(ctx.principal.userId),
        })),
    }),
  });
}

export type NotifyRouter = ReturnType<typeof createNotifyRouter>;
