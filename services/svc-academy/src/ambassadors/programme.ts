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

  /**
   * L3 — active ambassador user ids (sorted). Empty store → empty list.
   */
  listActiveUserIds(): readonly string[] {
    return this.list('active')
      .map((r) => r.userId)
      .sort();
  }

  /**
   * L3 — sorted frozen user ids for operator freeze board.
   * Empty programme → [] (never invent freezes).
   */
  frozenUserIds(): readonly string[] {
    return this.list('frozen')
      .map((r) => r.userId)
      .sort();
  }

  /**
   * L3 — freeze reason for one user. Missing or not frozen → null (no invent).
   */
  freezeReasonOf(userId: string): string | null {
    const row = this.get(userId.trim());
    if (!row || row.status !== 'frozen') return null;
    return row.freezeReason;
  }

  /**
   * L3 — true only when stored row is active. Missing/frozen → false (never invent).
   */
  isActiveAmbassador(userId: string): boolean {
    const row = this.get(userId.trim());
    return row?.status === 'active';
  }

  /**
   * L3 — appointed-by operator ids (unique, sorted). Empty store → [].
   */
  appointingOperators(): readonly string[] {
    const set = new Set<string>();
    for (const r of this.byUser.values()) {
      if (r.appointedBy) set.add(r.appointedBy);
    }
    return [...set].sort();
  }

  /**
   * L3 — frozen ambassador user ids (sorted). Empty → [].
   */
  listFrozenUserIds(): readonly string[] {
    return this.list('frozen')
      .map((r) => r.userId)
      .sort();
  }

  /**
   * L3 — how many programme rows were appointed by one operator. Unknown → 0.
   */
  countAppointedBy(operatorId: string): number {
    const op = operatorId.trim();
    if (!op) return 0;
    let n = 0;
    for (const r of this.byUser.values()) {
      if (r.appointedBy === op) n += 1;
    }
    return n;
  }

  /** L3 — frozen programme row count. Empty → 0. */
  frozenCount(): number {
    return this.list('frozen').length;
  }

  /** L3 — true when stored row is frozen. Missing → false (never invent). */
  isAmbassadorFrozen(userId: string): boolean {
    const row = this.get(userId.trim());
    return row?.status === 'frozen';
  }

  /**
   * L3 — all programme user ids (sorted). Empty store → [] (never invent).
   */
  listAllUserIds(): readonly string[] {
    return [...this.byUser.keys()].sort();
  }

  /**
   * L3 — total programme rows (active+frozen). Empty → 0.
   */
  totalCount(): number {
    return this.byUser.size;
  }

  /** L3 — true when programme store has no rows. */
  isEmpty(): boolean {
    return this.byUser.size === 0;
  }

  /**
   * L3 — active / total as fixed 4dp string. Empty store → null (never invent 0 ratio).
   */
  activeRatio(): string | null {
    const total = this.byUser.size;
    if (total === 0) return null;
    return (this.activeCount() / total).toFixed(4);
  }

  /**
   * L3 — alias of listFrozenUserIds (sorted frozen ids).
   */
  frozenProgrammeIds(): readonly string[] {
    return this.listFrozenUserIds();
  }

  /**
   * L3 — alias of isActiveAmbassador for operator copy.
   */
  isProgrammeActive(userId: string): boolean {
    return this.isActiveAmbassador(userId);
  }

  /**
   * L3 — true when any programme row exists (active or frozen). Empty → false.
   */
  hasAnyProgrammeRow(): boolean {
    return this.byUser.size > 0;
  }

  /**
   * L3 — frozen/total as fixed 4dp string. Empty programme → null (never invent 0).
   */
  frozenRatio(): string | null {
    const total = this.byUser.size;
    if (total === 0) return null;
    return (this.frozenCount() / total).toFixed(4);
  }

  /**
   * L3 — alias of listActiveUserIds (sorted active ambassadors).
   */
  activeProgrammeIds(): readonly string[] {
    return this.listActiveUserIds();
  }

  /** L3 — alias of totalCount. */
  programmeUserCount(): number {
    return this.totalCount();
  }

  /** L3 — alias of frozenCount. */
  frozenProgrammeCount(): number {
    return this.frozenCount();
  }

  /**
   * L3 — active programme count (appointments not frozen). Empty → 0.
   */
  activeProgrammeCount(): number {
    return this.activeCount();
  }

  /**
   * L3 — true when any ambassador is frozen. Empty → false.
   */
  hasFrozenAmbassador(): boolean {
    return this.frozenCount() > 0;
  }

  /**
   * L3 — true when any ambassador is active. Empty → false.
   */
  hasActiveAmbassador(): boolean {
    return this.activeCount() > 0;
  }

  /**
   * L3 — statuses present in the store (stable order: active then frozen). Empty → [].
   */
  listStatusesPresent(): readonly AmbassadorStatus[] {
    const out: AmbassadorStatus[] = [];
    if (this.activeCount() > 0) out.push('active');
    if (this.frozenCount() > 0) out.push('frozen');
    return out;
  }

  /**
   * L3 — true when programme is fully frozen (no active). Empty → false (not invent all-frozen).
   */
  isFullyFrozen(): boolean {
    return this.totalCount() > 0 && this.activeCount() === 0;
  }

  /**
   * L3 — true when programme is fully active (no frozen). Empty → false.
   */
  isFullyActive(): boolean {
    return this.totalCount() > 0 && this.frozenCount() === 0;
  }

  /**
   * L3 — active/total as fixed 4dp (alias surface for operator UI). Empty → null.
   */
  programmeActiveRatio(): string | null {
    return this.activeRatio();
  }

  /**
   * L3 — partitioned active then frozen user ids. Empty partitions → [].
   */
  listPartitionedUserIds(): { readonly active: readonly string[]; readonly frozen: readonly string[] } {
    return { active: this.listActiveUserIds(), frozen: this.listFrozenUserIds() };
  }

  /** L3 — true when active count is exactly one. Empty → false. */
  hasSingleActive(): boolean {
    return this.activeCount() === 1;
  }

  /** L3 — true when frozen count is exactly one. Empty → false. */
  hasSingleFrozen(): boolean {
    return this.frozenCount() === 1;
  }

  /**
   * L3 — inactive (frozen) count alias for operator copy. Empty → 0.
   */
  inactiveProgrammeCount(): number {
    return this.frozenCount();
  }

  /**
   * L3 — first active user id (sorted). None → null (never invent).
   */
  firstActiveUserId(): string | null {
    const ids = this.listActiveUserIds();
    return ids[0] ?? null;
  }

  /** L3 — first frozen user id (sorted). None → null. */
  firstFrozenUserId(): string | null {
    const ids = this.listFrozenUserIds();
    return ids[0] ?? null;
  }

  /** L3 — true when active count exceeds frozen count. Empty → false. */
  majorityActive(): boolean {
    return this.activeCount() > this.frozenCount() && this.totalCount() > 0;
  }

  /** L3 — true when frozen count exceeds active count. Empty → false. */
  majorityFrozen(): boolean {
    return this.frozenCount() > this.activeCount() && this.totalCount() > 0;
  }

  /** L3 — last appointed active id (sorted last). None → null. */
  lastActiveUserId(): string | null {
    const ids = this.listActiveUserIds();
    return ids.length ? ids[ids.length - 1]! : null;
  }

  /** L3 — balance active-frozen as signed integer (active - frozen). Empty → 0. */
  activeMinusFrozen(): number {
    return this.activeCount() - this.frozenCount();
  }

  /** L3 — true when counts are equal and non-empty. Empty → false. */
  isActiveFrozenBalanced(): boolean {
    return this.totalCount() > 0 && this.activeCount() === this.frozenCount();
  }

  /** L3 — last frozen user id (sorted last). None → null. */
  lastFrozenUserId(): string | null {
    const ids = this.listFrozenUserIds();
    return ids.length ? ids[ids.length - 1]! : null;
  }

  /** L3 — programme density: total users (alias surface). */
  programmeDensity(): number {
    return this.totalCount();
  }

  /** L3 — true when density is at least n. Empty → false for n>0. */
  hasAtLeastUsers(n: number): boolean {
    if (!Number.isFinite(n) || n < 0) return false;
    return this.totalCount() >= Math.floor(n);
  }

  /** L3 — active count as string for operator panels. */
  activeCountLabel(): string {
    return String(this.activeCount());
  }

  /** L3 — frozen count as string. */
  frozenCountLabel(): string {
    return String(this.frozenCount());
  }

  /** L3 — true when programme has both statuses present. */
  hasBothStatuses(): boolean {
    return this.activeCount() > 0 && this.frozenCount() > 0;
  }

  /** L3 — total count as operator label string. */
  totalCountLabel(): string {
    return String(this.totalCount());
  }

  /** L3 — true when active ratio is at least half (uses activeRatio). Empty → false. */
  isMajorityActiveOrTie(): boolean {
    const r = this.activeRatio();
    if (r === null) return false;
    return Number(r) >= 0.5;
  }

  /** L3 — true when frozen ratio is at least half. Empty → false. */
  isMajorityFrozenOrTie(): boolean {
    const r = this.frozenRatio();
    if (r === null) return false;
    return Number(r) >= 0.5;
  }

  /** L3 — comma-joined active ids for panel copy. Empty → "". */
  activeUserIdsJoined(): string {
    return this.listActiveUserIds().join(',');
  }

  /** L3 — frozen user ids joined. Empty → "". */
  frozenUserIdsJoined(): string {
    return this.listFrozenUserIds().join(',');
  }

  /** L3 — all user ids joined. Empty → "". */
  allUserIdsJoined(): string {
    return this.listAllUserIds().join(',');
  }

  /** L3 — statuses present joined. Empty → "". */
  statusesPresentJoined(): string {
    return this.listStatusesPresent().join(',');
  }

  /** L3 — true when density is zero. */
  isProgrammeEmptyLabel(): boolean {
    return this.isEmpty();
  }

  /** L3 — active ratio label or empty when null. */
  activeRatioLabel(): string {
    return this.activeRatio() ?? '';
  }

  /** L3 — frozen ratio label or empty when null. */
  frozenRatioLabel(): string {
    return this.frozenRatio() ?? '';
  }

  /** L3 — programme active ratio label (alias surface). */
  programmeActiveRatioLabel(): string {
    return this.programmeActiveRatio() ?? '';
  }

  /** L3 — true when density exceeds active (always when frozen present). */
  hasInactiveRows(): boolean {
    return this.frozenCount() > 0;
  }

  /** L3 — snapshot counts for operator board. Empty zeros. */
  programmeCountSnapshot(): { readonly active: number; readonly frozen: number; readonly total: number } {
    return { active: this.activeCount(), frozen: this.frozenCount(), total: this.totalCount() };
  }

  /** L3 — true when snapshot total equals active + frozen. */
  programmeCountsConsistent(): boolean {
    const s = this.programmeCountSnapshot();
    return s.total === s.active + s.frozen;
  }

  /** L3 — active share percent 0..100 integer. Empty → null. */
  activeSharePercent(): number | null {
    const r = this.activeRatio();
    if (r === null) return null;
    return Math.round(Number(r) * 100);
  }

  /** L3 — frozen share percent 0..100 integer. Empty → null. */
  frozenSharePercent(): number | null {
    const r = this.frozenRatio();
    if (r === null) return null;
    return Math.round(Number(r) * 100);
  }
}
