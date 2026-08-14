import type { Amount } from '@intafaced/ledger-client';
import { TradeError } from '../spot/types.js';
import type { TwapParent } from './types.js';
import type { TwapParentStore } from './parent-store.js';

/** In-memory TWAP engine surface used by hydrate-on-mutate. */
export interface AlgoHydrateTarget {
  get(parentId: string): TwapParent | undefined;
  hydrate(parent: TwapParent, plan: readonly Amount[]): void;
  planOf(parentId: string): readonly Amount[] | undefined;
}

/**
 * Load a durable TWAP parent into the engine if this process does not already
 * hold it. Pause/resume/cancel after restart must not 404 a schedule that
 * Postgres still has.
 */
export async function hydrateAlgoIfMissing(
  engine: AlgoHydrateTarget,
  store: TwapParentStore,
  userId: string,
  parentId: string,
): Promise<void> {
  if (engine.get(parentId)) return;
  const loaded = await store.load(parentId);
  if (!loaded || loaded.parent.userId !== userId) {
    throw new TradeError(`algo ${parentId} not found`, 'trade.algo_not_found');
  }
  engine.hydrate(loaded.parent, loaded.plan);
}

/**
 * Job-host hydrate: load by parent id with no caller principal. Tick after
 * restart reinstalls the durable createTwap place grant (not a minted userId).
 */
export async function hydrateAlgoFromStore(engine: AlgoHydrateTarget, store: TwapParentStore, parentId: string): Promise<void> {
  if (engine.get(parentId)) return;
  const loaded = await store.load(parentId);
  if (!loaded) {
    throw new TradeError(`algo ${parentId} not found`, 'trade.algo_not_found');
  }
  engine.hydrate(loaded.parent, loaded.plan);
}

/** Await the durable write after pause/resume/cancel (onChange is fire-and-forget). */
export async function persistAlgoMutation(engine: AlgoHydrateTarget, store: TwapParentStore, parent: TwapParent): Promise<TwapParent> {
  const plan = engine.planOf(parent.id) ?? [];
  await store.save({ parent, plan });
  return parent;
}
