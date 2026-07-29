/**
 * STRUCTURED PATHS (§XIII "structured paths, Blueprint-sequenced";
 * "certification ranks → real perks").
 *
 * Pure. A path is a SEQUENCE, and these functions are the whole of what that
 * means: an item opens when everything before it is done, a path completes when
 * every item is done, and a completed path is worth a defined number of XP.
 *
 * The XP figure lives here rather than in the service because it is the thing a
 * certification is worth — publishing it into svc-identity's rank ladder is a
 * one-way movement, and a formula that lives in one function can be reasoned
 * about, tested, and changed with everyone able to see what changed.
 */

export interface PathItem {
  id: string;
  position: number;
  kind: 'playbook' | 'workbook' | 'video';
  paperTrading: boolean;
}

export class ProgressError extends Error {
  constructor(
    message: string,
    readonly code: 'academy.item_locked' | 'academy.item_not_in_path',
  ) {
    super(message);
    this.name = 'ProgressError';
  }
}

/** Items in path order. Callers may pass them in any order; this fixes it. */
function ordered(items: readonly PathItem[]): PathItem[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/**
 * The next item a learner should open, or null when the path is finished.
 *
 * Lowest unfinished position — so a learner who skipped ahead by completing a
 * later item out of band is still pointed back at the gap rather than at the
 * end.
 */
export function nextItem(items: readonly PathItem[], completed: ReadonlySet<string>): PathItem | null {
  return ordered(items).find((i) => !completed.has(i.id)) ?? null;
}

/**
 * May this item be completed now?
 *
 * Everything at a lower position must already be done. Without this, "path"
 * means nothing: a learner could complete item 12 first and hold a
 * certification for a sequence they never followed.
 *
 * Re-completing an item already done is allowed and is a no-op at the service
 * layer — a learner revisiting a workbook is not an error.
 */
export function assertUnlocked(items: readonly PathItem[], completed: ReadonlySet<string>, itemId: string): PathItem {
  const all = ordered(items);
  const item = all.find((i) => i.id === itemId);
  if (!item) throw new ProgressError('That item is not part of this path', 'academy.item_not_in_path');

  const blocking = all.filter((i) => i.position < item.position && !completed.has(i.id));
  if (blocking.length > 0) {
    throw new ProgressError(
      `Finish the ${blocking.length} step(s) before this one first — this is a sequenced path`,
      'academy.item_locked',
    );
  }
  return item;
}

export interface PathProgress {
  total: number;
  completed: number;
  /** Basis points, 0–10000. An integer, so two clients render the same bar. */
  percentBps: number;
  nextItemId: string | null;
  finished: boolean;
}

export function pathProgress(items: readonly PathItem[], completed: ReadonlySet<string>): PathProgress {
  const all = ordered(items);
  const done = all.filter((i) => completed.has(i.id)).length;
  const next = nextItem(all, completed);

  return {
    total: all.length,
    completed: done,
    // An empty path is 0%, not 100%. A path with no items is unfinished
    // authoring, and reporting it complete would certify people for nothing.
    percentBps: all.length === 0 ? 0 : Math.floor((done * 10_000) / all.length),
    nextItemId: next?.id ?? null,
    finished: all.length > 0 && done === all.length,
  };
}

export interface XpPolicy {
  /** Awarded for finishing the path at all. */
  base: number;
  /** Awarded per item in it, so a longer path is worth more. */
  perItem: number;
}

/**
 * What one certification is worth.
 *
 * Deliberately a function of the PATH's length and not of the learner's scores.
 * XP here is a record that a curriculum was completed; grading a person's
 * answers into their platform-wide rank would make the ladder a measure of how
 * generously a workbook was marked.
 */
export function certificationXp(items: readonly PathItem[], policy: XpPolicy): number {
  if (items.length === 0) return 0;
  return policy.base + policy.perItem * items.length;
}

/**
 * The XP event's idempotency key.
 *
 * A business key, per §5 of the agent protocol: one certification per
 * (curriculum, user), forever. A redelivered event finds the original award
 * rather than inflating a rank.
 */
export function certificationXpKey(curriculumId: string, userId: string): string {
  return `academy.certification:${curriculumId}:${userId}`;
}
