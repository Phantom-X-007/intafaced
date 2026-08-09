import { z } from 'zod';
import { router, publicProcedure, scopedProcedure } from '@intafaced/contracts';
import type { NotifyService } from './notify-service.js';
import type { DeliveryRecord } from './channel-store.js';
import type { Notification } from './store.js';
import { CHANNEL_IDS, OUT_OF_APP_CHANNELS } from './channels/channel.js';

/**
 * svc-notify API — inbox, channels, and the delivery record.
 *
 * Every procedure operates on `ctx.principal.userId` and never on a userId from
 * input. Mark-read of another account's ids is a silent no-op at the store
 * (self-only), and the router never accepts a target userId.
 *
 * `notify` is non-custodial and `minTier: 'none'` — the guard's job is scope and
 * region, not verification.
 *
 * WHY `notify.deliveries` IS A USER-FACING PROCEDURE
 *
 * Because the answer belongs to the user. If a margin call was raised and the
 * email never went out, the person whose collateral is at risk is the one who
 * most needs to see `email: refused, channel.not_configured`. Putting that only
 * behind an admin console would leave the honest record where the affected party
 * cannot reach it.
 */

const severitySchema = z.enum(['info', 'action', 'critical']);
const channelSchema = z.enum(CHANNEL_IDS);
const outOfAppChannelSchema = z.enum(OUT_OF_APP_CHANNELS);

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

const deliveryOutput = z.object({
  channel: channelSchema,
  status: z.enum(['pending', 'accepted', 'refused', 'failed', 'abandoned']),
  attempts: z.number().int().nonnegative(),
  /** Non-null means a send was attempted. */
  attemptedAt: z.string().nullable(),
  /** Non-null means a transport accepted it. Two different facts, two columns. */
  acceptedAt: z.string().nullable(),
  /** A code, never a sentence — the client renders copy from `@intafaced/i18n`. */
  refusalCode: z.string().nullable(),
});

const targetOutput = z.object({
  channel: outOfAppChannelSchema,
  address: z.string(),
  locale: z.string(),
  verifiedAt: z.string().nullable(),
});

/**
 * Address shapes, per channel.
 *
 * Deliberately shallow. No regex can tell a real mailbox from a plausible one —
 * the confirmation code does that, which is why registration always sends one.
 * This check exists only to stop obvious nonsense reaching a gateway.
 */
const registerInput = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), address: z.string().email().max(320), locale: z.string().max(16).optional() }),
  z.object({
    channel: z.literal('sms'),
    // E.164, not a formatting preference: a gateway handed a local-format number
    // still sends it somewhere, and where is nobody's guess but the carrier's.
    address: z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be an E.164 number, e.g. +447700900000'),
    locale: z.string().max(16).optional(),
  }),
  z.object({
    channel: z.literal('push'),
    // Device tokens are opaque strings whose shape belongs to whoever issued
    // them. Bounded, not parsed — parsing would bake a vendor's format into this
    // repository (§0.7).
    address: z.string().min(8).max(4096),
    locale: z.string().max(16).optional(),
  }),
]);

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

function deliveryToWire(d: DeliveryRecord) {
  return {
    channel: d.channel,
    status: d.status,
    attempts: d.attempts,
    attemptedAt: d.attemptedAt?.toISOString() ?? null,
    acceptedAt: d.acceptedAt?.toISOString() ?? null,
    refusalCode: d.refusalCode,
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

      /**
       * Which channels can reach anyone right now, and what is missing.
       *
       * `requires` names environment variables — an operator instruction in a
       * user-facing response, deliberately. This platform is run by its owner,
       * the same person reads both surfaces, and a vaguer answer would send them
       * into the source to find out which key is absent. It names no provider,
       * only our own variable names (§0.7).
       */
      channels: scopedProcedure('notify:read', { module: 'notify' })
        .output(
          z.array(
            z.object({
              channel: channelSchema,
              available: z.boolean(),
              reason: z.string().nullable(),
              requires: z.array(z.string()),
            }),
          ),
        )
        .query(() =>
          notify.channelStatus().map((s) => ({
            channel: s.channel,
            available: s.available,
            reason: s.reason,
            requires: [...s.requires],
          })),
        ),

      targets: scopedProcedure('notify:read', { module: 'notify' })
        .output(z.array(targetOutput))
        .query(async ({ ctx }) => {
          const targets = await notify.listTargets(ctx.principal.userId);
          return targets
            .filter((t) => t.channel !== 'inapp')
            .map((t) => ({
              channel: t.channel as 'email' | 'push' | 'sms',
              address: t.address,
              locale: t.locale,
              verifiedAt: t.verifiedAt?.toISOString() ?? null,
            }));
        }),

      /**
       * Register an address and send it a confirmation code.
       *
       * The outcome is reported, never smoothed over. `refused` with
       * `channel.not_configured` means the owner has not obtained credentials
       * for this channel and the address will stay unconfirmed — the truth, and
       * infinitely better than a green tick over silence.
       */
      registerTarget: scopedProcedure('notify:write', { module: 'notify' })
        .input(registerInput)
        .output(
          z.object({
            status: z.enum(['sent', 'refused', 'failed']),
            channel: outOfAppChannelSchema,
            code: z.string().nullable(),
            expiresAt: z.string(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          const outcome = await notify.registerTarget({
            userId: ctx.principal.userId,
            channel: input.channel,
            address: input.address,
            locale: input.locale ?? 'en',
          });
          return {
            status: outcome.status,
            channel: outcome.channel,
            code: outcome.status === 'refused' ? outcome.code : null,
            expiresAt: outcome.expiresAt.toISOString(),
          };
        }),

      /**
       * Confirm an address. Wrong, expired and already-spent codes are one
       * answer (`verified: false`, `code: null`). Rate limit is a named refuse
       * code so the client can render "try later" without inventing copy.
       */
      verifyTarget: scopedProcedure('notify:write', { module: 'notify' })
        .input(z.object({ channel: outOfAppChannelSchema, code: z.string().regex(/^\d{6}$/) }))
        .output(
          z.object({
            verified: z.boolean(),
            /** Set when the call was refused (rate limit). Null on success / wrong code. */
            code: z.string().nullable(),
          }),
        )
        .mutation(async ({ ctx, input }) => {
          const outcome = await notify.verifyTarget(ctx.principal.userId, input.channel, input.code);
          if (outcome.status === 'verified') return { verified: true, code: null };
          if (outcome.status === 'refused') return { verified: false, code: outcome.code };
          return { verified: false, code: null };
        }),

      removeTarget: scopedProcedure('notify:write', { module: 'notify' })
        .input(z.object({ channel: outOfAppChannelSchema }))
        .output(z.object({ removed: z.boolean() }))
        .mutation(async ({ ctx, input }) => ({
          removed: await notify.removeTarget(ctx.principal.userId, input.channel),
        })),

      /**
       * What actually happened to one of the caller's notifications, per channel.
       *
       * An id the caller does not own returns an empty list rather than an
       * error, because an error distinguishing "not yours" from "no such row"
       * tells a stranger which notification ids exist.
       */
      deliveries: scopedProcedure('notify:read', { module: 'notify' })
        .input(z.object({ notificationId: z.string().uuid() }))
        .output(z.array(deliveryOutput))
        .query(async ({ ctx, input }) => (await notify.deliveriesFor(ctx.principal.userId, input.notificationId)).map(deliveryToWire)),

      /** Out-of-app mute prefs. Critical severity never respects mute (dispatch law). */
      mutePrefs: scopedProcedure('notify:read', { module: 'notify' })
        .output(
          z.array(
            z.object({
              channel: z.enum(['email', 'push', 'sms']),
              muted: z.boolean(),
            }),
          ),
        )
        .query(async ({ ctx }) => notify.listMutePrefs(ctx.principal.userId)),

      setMute: scopedProcedure('notify:write', { module: 'notify' })
        .input(z.object({ channel: z.enum(['email', 'push', 'sms']), muted: z.boolean() }))
        .output(
          z.array(
            z.object({
              channel: z.enum(['email', 'push', 'sms']),
              muted: z.boolean(),
            }),
          ),
        )
        .mutation(async ({ ctx, input }) => {
          await notify.setChannelMute(ctx.principal.userId, input.channel, input.muted);
          return notify.listMutePrefs(ctx.principal.userId);
        }),
    }),
  });
}

export type NotifyRouter = ReturnType<typeof createNotifyRouter>;
