import { MemorySeenStore, idempotent, type EventBus, type SeenStore, type Subscription } from '@intafaced/events';
import type { Sql } from './blueprint-profile.js';
import { applyBlueprintCreated, applyBlueprintDeleted } from './blueprint-profile.js';

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
