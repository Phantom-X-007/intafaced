import { MemorySeenStore, idempotent, type EventBus, type SeenStore, type Subscription } from '@intafaced/events';
import type { Sql } from './blueprint-profile.js';
import { applyBlueprintCreated, applyBlueprintDeleted } from './blueprint-profile.js';
import type { RankService } from './rank/rank-service.js';

/**
 * EVENT WIRING — blueprint → identity profile pointer (§7.2, §2, §10).
 *
 * Catalog contract:
 *   blueprintCreated → set profiles.blueprint_id
 *   blueprintDeleted → clear profiles.blueprint_id when it still matches
 *
 * Durable names survive restarts. Handlers are wrapped in `idempotent()` so
 * JetStream at-least-once delivery cannot thrash the row; the SQL itself is
 * also safe under replay (set is overwrite; clear is match-guarded).
 */
export async function subscribeBlueprintProfileEvents(
  bus: EventBus,
  sql: Sql,
  store: SeenStore = new MemorySeenStore(),
): Promise<Subscription[]> {
  const created = await bus.subscribe(
    'blueprintCreated',
    idempotent(
      async (payload) => {
        await applyBlueprintCreated(sql, {
          userId: payload.userId,
          blueprintId: payload.blueprintId,
        });
      },
      store,
      'svc-identity-blueprint-profile',
    ),
    { durable: 'identity-blueprint-created' },
  );

  const deleted = await bus.subscribe(
    'blueprintDeleted',
    idempotent(
      async (payload) => {
        await applyBlueprintDeleted(sql, {
          userId: payload.userId,
          blueprintId: payload.blueprintId,
        });
      },
      store,
      'svc-identity-blueprint-profile',
    ),
    { durable: 'identity-blueprint-deleted' },
  );

  return [created, deleted];
}

/**
 * EVENT WIRING — xpEarned → rank_state (§10). THE CONSUMER THAT DID NOT EXIST.
 *
 * ── What was broken ─────────────────────────────────────────────────────────
 *
 * svc-p2p and svc-trade both publish `xpEarned`, and both say in their own
 * comments that svc-identity is the way into `rank_state`. svc-identity
 * subscribed to two blueprint subjects and nothing else. `rank_state` was
 * written only by `awardXp` called from identity's own auth flows and its
 * `serviceProcedure`, so every award earned by trading or by a P2P trade was
 * retained by JetStream and read by nobody.
 *
 * PUBLISHED INTO THE VOID, and users could see the hole from the outside: a
 * rank or an XP total was wrong for everyone who earned it through P2P or
 * trading. That is what made it a Class B defect rather than a socket.
 *
 * ── Why this is nine lines and not a project ────────────────────────────────
 *
 * The handshake was already agreed on both sides. `AwardXpInput` is the
 * `xpEarned` payload field-for-field plus `idempotencyKey`, and the producers
 * already shape their keys — `p2p:<action>:<tradeId>:<userId>` and
 * `trade.order.xp:<orderId>` — to land in `xp_events.idempotency_key`. So the
 * envelope's key goes through untranslated, and `awardXp`'s
 * `ON CONFLICT (idempotency_key) DO NOTHING` is the durable dedupe. The
 * `idempotent()` wrapper in front of it is a cheap in-process pre-filter, not
 * the guarantee.
 *
 * No stream change either: `xpEarned` is declared on the `identity` service, so
 * it lives on `INTAFACED_IDENTITY`, which this process already owns and creates.
 * svc-p2p and svc-trade publish INTO our stream. There is no attach-when-it-
 * exists dance to do, because we are the owner.
 *
 * ── The one decision: an award for a user we do not have ────────────────────
 *
 * `xp_events.user_id` references `identity.users`, so an award for an unknown
 * or deleted user raises an FK violation, which throws, which NAKs, which parks
 * the message after `max_deliver`.
 *
 * That is deliberate and it is the whole point of this consumer. The
 * alternative — catch it and ack — makes XP silently vanish, which is precisely
 * the failure this wiring exists to end; it would replace "nobody consumes the
 * stream" with "the consumer eats what it cannot explain", and the second is
 * harder to find than the first. A parked message is how a human learns that a
 * producer is emitting a user id identity has never heard of. Retrying five
 * times first is wasted but harmless, and it costs nothing to leave the
 * transient/permanent split to the day something actually needs it.
 */
export async function subscribeXpEvents(
  bus: EventBus,
  rank: Pick<RankService, 'awardXp'>,
  store: SeenStore = new MemorySeenStore(),
): Promise<Subscription> {
  return bus.subscribe(
    'xpEarned',
    idempotent(
      async (payload, envelope) => {
        await rank.awardXp({
          userId: payload.userId,
          sourceModule: payload.sourceModule,
          action: payload.action,
          xpDelta: payload.xpDelta,
          // The producers' business key, straight through. Translating it here
          // would break the handshake `xp_events.idempotency_key` was shaped
          // for, and two keys for one award is one award paid twice.
          idempotencyKey: envelope.idempotencyKey,
          ...(payload.meta ? { meta: payload.meta } : {}),
        });
      },
      store,
      'svc-identity-xp',
    ),
    { durable: 'identity-xp-earned' },
  );
}
