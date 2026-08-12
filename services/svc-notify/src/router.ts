import { z } from 'zod';
import { router, publicProcedure, scopedProcedure } from '@intafaced/contracts';
import type { NotifyService } from './notify-service.js';
import type { DeliveryRecord } from './channel-store.js';
import type { Notification } from './store.js';
import { CHANNEL_IDS, OUT_OF_APP_CHANNELS } from './channels/channel.js';
import type { AlertService } from './alerts/service.js';
import type { PriceAlert } from './alerts/types.js';

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

const priceAlertOutput = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  marketId: z.string(),
  direction: z.enum(['above', 'below']),
  targetPrice: z.string(),
  status: z.enum(['active', 'fired', 'cancelled']),
  firedAt: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * WHETHER A WATCH CAN FIRE — returned with the watchlist and with every watch
 * created, not parked behind a procedure a client might not call.
 *
 * D-S-13 done-bar item 6: reclassifying a promise-with-no-delivery requires the
 * disclosure to exist in code at the surface a user reads. Somebody who has just
 * created a price watch is exactly the person entitled to know that this
 * deployment has no mark feed and therefore nothing will cross.
 *
 * Codes, never sentences — clients render copy from `@intafaced/i18n` (§9), and
 * `canFire: true` is a statement about wiring, never an SLA (§8 item 9).
 */
const alertEvaluationOutput = z.object({
  markSource: z.enum(['dark', 'live']),
  canFire: z.boolean(),
  code: z.enum(['alert.price_unavailable']).nullable(),
});

/** The answer when this deployment has no alert service at all. */
const NO_ALERT_SERVICE = { markSource: 'dark', canFire: false, code: 'alert.price_unavailable' } as const;

function priceAlertToWire(row: PriceAlert) {
  return {
    id: row.id,
    userId: row.userId,
    marketId: row.marketId,
    direction: row.direction,
    targetPrice: row.targetPrice,
    status: row.status,
    firedAt: row.firedAt ? row.firedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * @param alerts Optional v22.alerts MVP service. When absent, alert procedures
 * refuse with a clear shape rather than inventing a silent empty list that
 * pretends the feature is live.
 */
export function createNotifyRouter(notify: NotifyService, alerts?: AlertService) {
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
       *
       * `socket` is the Doctrine §13 tracker id for out-of-app channels
       * (`socket.notify-email|push|sms`). Null for `inapp` — that is the
       * fan-out mountain (`ops.notifications`), not a credential socket
       * (D26-P1-O5). Closing a socket needs Class X credentials; refusing
       * when unset is the honest state, not a half-built channel.
       */
      channels: scopedProcedure('notify:read', { module: 'notify' })
        .output(
          z.array(
            z.object({
              channel: channelSchema,
              available: z.boolean(),
              reason: z.string().nullable(),
              requires: z.array(z.string()),
              socket: z.string().nullable(),
            }),
          ),
        )
        .query(() =>
          notify.channelStatus().map((s) => ({
            channel: s.channel,
            available: s.available,
            reason: s.reason,
            requires: [...s.requires],
            socket: s.socket,
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

      /**
       * v22.alerts MVP — price watchlists.
       *
       * The user surface is create / list / cancel. Evaluation is the mounted
       * sweep (`AlertService.evaluateDueAlerts`, wired in `index.ts` — a pin test
       * fails if that call disappears, because a watch nothing evaluates is a
       * promise with no delivery).
       *
       * `evaluation` rides with the list rather than sitting behind its own
       * procedure: a client cannot render somebody's watchlist without also
       * receiving the fact that no watch on it can currently cross.
       */
      alerts: scopedProcedure('notify:read', { module: 'notify' })
        .output(z.object({ items: z.array(priceAlertOutput), evaluation: alertEvaluationOutput }))
        .query(async ({ ctx }) => {
          if (!alerts) return { items: [], evaluation: NO_ALERT_SERVICE };
          return {
            items: (await alerts.list(ctx.principal.userId)).map(priceAlertToWire),
            evaluation: alerts.evaluationStatus(),
          };
        }),

      createAlert: scopedProcedure('notify:write', { module: 'notify' })
        .input(
          z.object({
            marketId: z.string().min(1).max(64),
            direction: z.enum(['above', 'below']),
            /** Decimal string — never a JSON number. */
            targetPrice: z.string().min(1).max(64),
          }),
        )
        // The watch AND whether it can fire, in the same answer. A create that
        // returned only `status: 'active'` is what let this surface promise
        // delivery it had no path for.
        .output(z.object({ alert: priceAlertOutput, evaluation: alertEvaluationOutput }))
        .mutation(async ({ ctx, input }) => {
          if (!alerts) {
            throw new Error('price alerts are not configured on this deployment');
          }
          const row = await alerts.create({
            userId: ctx.principal.userId,
            marketId: input.marketId,
            direction: input.direction,
            targetPrice: input.targetPrice,
          });
          return { alert: priceAlertToWire(row), evaluation: alerts.evaluationStatus() };
        }),

      cancelAlert: scopedProcedure('notify:write', { module: 'notify' })
        .input(z.object({ id: z.string().uuid() }))
        .output(z.object({ cancelled: z.boolean(), alert: priceAlertOutput.nullable() }))
        .mutation(async ({ ctx, input }) => {
          if (!alerts) return { cancelled: false, alert: null };
          const row = await alerts.cancel(ctx.principal.userId, input.id);
          if (!row) return { cancelled: false, alert: null };
          return { cancelled: row.status === 'cancelled', alert: priceAlertToWire(row) };
        }),
    }),
  });
}

export type NotifyRouter = ReturnType<typeof createNotifyRouter>;
