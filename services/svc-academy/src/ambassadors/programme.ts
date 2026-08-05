/**
 * AMBASSADOR PROGRAMME — Stage-1 status only (TRK-academy.ambassadors).
 *
 * Appoint / freeze / public badge. NO pay, NO revenue share, NO ledger client.
 * Hosting a lobby remains §4.1 `lobbyHostRights` (host-rights.ts) — programme
 * status is a label + operator control surface, not a second host gate that
 * could contradict identity rank law.
 *
 * Rights matrix (Stage-1, checkable):
 *
 * | Capability                         | Gate                                      |
 * | ---------------------------------- | ----------------------------------------- |
 * | Open lobby / invite / run session  | `lobbyHostRights` perk (svc-identity)     |
 * | Programme badge `active`           | row in ambassadors with status=active     |
 * | Programme badge `frozen`           | row with status=frozen                    |
 * | Appoint / freeze / unfreeze        | operator `admin:write` on the API         |
 * | IFC pay / revenue share            | NOT built (Class M Stage-2)               |
 *
 * An active ambassador without lobbyHostRights still cannot create rooms.
 * A host with lobbyHostRights who is not appointed still hosts — programme
 * layers on rank; it does not replace it.
 */

export type AmbassadorStatus = 'active' | 'frozen';

export interface AmbassadorRecord {
  userId: string;
  status: AmbassadorStatus;
  appointedBy: string;
  appointedAt: Date;
  frozenAt: Date | null;
  frozenBy: string | null;
  freezeReason: string | null;
}

export interface AmbassadorBadge {
  userId: string;
  /** true only when an active programme row exists */
  isAmbassador: boolean;
  status: AmbassadorStatus | null;
}

/** Pure: badge view from optional row. */
export function badgeOf(userId: string, row: AmbassadorRecord | null): AmbassadorBadge {
  if (!row) return { userId, isAmbassador: false, status: null };
  return {
    userId,
    isAmbassador: row.status === 'active',
    status: row.status,
  };
}

/** Pure: validate freeze reason before write. */
export function assertFreezeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    throw new AmbassadorProgrammeError('Freeze reason must name why (min 3 characters after trim)', 'academy.ambassador_invalid');
  }
  if (trimmed.length > 500) {
    throw new AmbassadorProgrammeError('Freeze reason max 500 characters', 'academy.ambassador_invalid');
  }
  return trimmed;
}

export type AmbassadorProgrammeErrorCode =
  'academy.ambassador_not_found' | 'academy.ambassador_already_active' | 'academy.ambassador_already_frozen' | 'academy.ambassador_invalid';

export class AmbassadorProgrammeError extends Error {
  constructor(
    message: string,
    readonly code: AmbassadorProgrammeErrorCode,
  ) {
    super(message);
    this.name = 'AmbassadorProgrammeError';
  }
}

/**
 * L3 in-memory programme store (non-pay). Appoint / freeze / unfreeze only.
 * Does not grant lobby host rights — identity perks remain SoT.
 */
export class MemoryAmbassadorProgramme {
  private readonly byUser = new Map<string, AmbassadorRecord>();

  get(userId: string): AmbassadorRecord | null {
    return this.byUser.get(userId) ?? null;
  }

  badge(userId: string): AmbassadorBadge {
    return badgeOf(userId, this.get(userId));
  }

  list(status?: AmbassadorStatus): readonly AmbassadorRecord[] {
    const rows = [...this.byUser.values()];
    const filtered = status ? rows.filter((r) => r.status === status) : rows;
    return filtered.sort((a, b) => a.appointedAt.getTime() - b.appointedAt.getTime());
  }

  appoint(input: { userId: string; appointedBy: string; now?: Date }): AmbassadorRecord {
    const userId = input.userId?.trim() ?? '';
    const appointedBy = input.appointedBy?.trim() ?? '';
    if (!userId || !appointedBy) {
      throw new AmbassadorProgrammeError('userId and appointedBy required', 'academy.ambassador_invalid');
    }
    const existing = this.byUser.get(userId);
    if (existing?.status === 'active') {
      throw new AmbassadorProgrammeError(`User ${userId} is already an active ambassador`, 'academy.ambassador_already_active');
    }
    const row: AmbassadorRecord = {
      userId,
      status: 'active',
      appointedBy,
      appointedAt: input.now ?? new Date(),
      frozenAt: null,
      frozenBy: null,
      freezeReason: null,
    };
    this.byUser.set(userId, row);
    return row;
  }

  freeze(input: { userId: string; frozenBy: string; reason: string; now?: Date }): AmbassadorRecord {
    const existing = this.byUser.get(input.userId);
    if (!existing) {
      throw new AmbassadorProgrammeError(`No ambassador programme row for ${input.userId}`, 'academy.ambassador_not_found');
    }
    if (existing.status === 'frozen') {
      throw new AmbassadorProgrammeError(`Ambassador ${input.userId} is already frozen`, 'academy.ambassador_already_frozen');
    }
    const row: AmbassadorRecord = {
      ...existing,
      status: 'frozen',
      frozenAt: input.now ?? new Date(),
      frozenBy: input.frozenBy.trim(),
      freezeReason: assertFreezeReason(input.reason),
    };
    this.byUser.set(input.userId, row);
    return row;
  }

  unfreeze(input: { userId: string }): AmbassadorRecord {
    const existing = this.byUser.get(input.userId);
    if (!existing) {
      throw new AmbassadorProgrammeError(`No ambassador programme row for ${input.userId}`, 'academy.ambassador_not_found');
    }
    if (existing.status !== 'frozen') {
      throw new AmbassadorProgrammeError(`Ambassador ${input.userId} is not frozen`, 'academy.ambassador_invalid');
    }
    const row: AmbassadorRecord = {
      ...existing,
      status: 'active',
      frozenAt: null,
      frozenBy: null,
      freezeReason: null,
    };
    this.byUser.set(input.userId, row);
    return row;
  }

  /**
   * L3 — badges for many users in one pass (shell directory).
   * Missing rows → isAmbassador false (never invent appointment).
   */
  badgesOf(userIds: readonly string[]): readonly AmbassadorBadge[] {
    return userIds.map((id) => this.badge(id.trim()));
  }

  /** Active-only count for operator dashboard. */
  activeCount(): number {
    return this.list('active').length;
  }

  /**
   * L3 — status histogram for operator desk.
   * Does not invent rows for non-ambassadors (only stored programme rows).
   */
  statusHistogram(): { readonly active: number; readonly frozen: number; readonly total: number } {
    let active = 0;
    let frozen = 0;
    for (const r of this.byUser.values()) {
      if (r.status === 'active') active += 1;
      else if (r.status === 'frozen') frozen += 1;
    }
    return { active, frozen, total: active + frozen };
  }
}
