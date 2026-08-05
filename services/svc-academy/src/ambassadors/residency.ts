/**
 * Ambassador Stage-2 — residency application (non-money).
 *
 * Spec: docs/ops/trk/academy.ambassadors.md Stage 2 pay is Class M — NOT here.
 * This slice: apply / review / accept|reject residency interest only.
 * No IFC pay, no revenue share, no ledger.
 */

export type ResidencyStatus = 'applied' | 'accepted' | 'rejected' | 'withdrawn';

export type ResidencyApplication = {
  readonly id: string;
  readonly userId: string;
  readonly cohortSlug: string;
  readonly statement: string;
  readonly status: ResidencyStatus;
  readonly appliedAt: Date;
  readonly decidedAt: Date | null;
  readonly decidedBy: string | null;
  readonly decisionNote: string | null;
};

export type ResidencyErrorCode =
  'academy.residency_invalid' | 'academy.residency_not_found' | 'academy.residency_already_open' | 'academy.residency_not_pending';

export class ResidencyError extends Error {
  constructor(
    message: string,
    readonly code: ResidencyErrorCode,
  ) {
    super(message);
    this.name = 'ResidencyError';
  }
}

export function assertCohortSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(s)) {
    throw new ResidencyError('Cohort slug must be 3–48 lowercase alphanumeric + hyphen', 'academy.residency_invalid');
  }
  return s;
}

export function assertStatement(statement: string): string {
  const t = statement.trim();
  if (t.length < 20) {
    throw new ResidencyError('Statement min 20 characters after trim', 'academy.residency_invalid');
  }
  if (t.length > 2000) {
    throw new ResidencyError('Statement max 2000 characters', 'academy.residency_invalid');
  }
  return t;
}

/** In-memory Stage-2 store for tests / early API. */
export class MemoryResidencyDesk {
  private rows = new Map<string, ResidencyApplication>();
  private seq = 0;

  apply(input: { userId: string; cohortSlug: string; statement: string; now?: Date }): ResidencyApplication {
    const cohortSlug = assertCohortSlug(input.cohortSlug);
    const statement = assertStatement(input.statement);
    const userId = input.userId.trim();
    if (!userId) throw new ResidencyError('userId required', 'academy.residency_invalid');
    for (const r of this.rows.values()) {
      if (r.userId === userId && r.cohortSlug === cohortSlug && r.status === 'applied') {
        throw new ResidencyError('Open application already exists for this cohort', 'academy.residency_already_open');
      }
    }
    this.seq += 1;
    const row: ResidencyApplication = {
      id: `res-${this.seq}`,
      userId,
      cohortSlug,
      statement,
      status: 'applied',
      appliedAt: input.now ?? new Date(),
      decidedAt: null,
      decidedBy: null,
      decisionNote: null,
    };
    this.rows.set(row.id, row);
    return row;
  }

  decide(input: { id: string; operatorId: string; decision: 'accepted' | 'rejected'; note?: string; now?: Date }): ResidencyApplication {
    const row = this.rows.get(input.id);
    if (!row) throw new ResidencyError('Application not found', 'academy.residency_not_found');
    if (row.status !== 'applied') {
      throw new ResidencyError(`Application is ${row.status}`, 'academy.residency_not_pending');
    }
    const next: ResidencyApplication = {
      ...row,
      status: input.decision,
      decidedAt: input.now ?? new Date(),
      decidedBy: input.operatorId.trim() || 'operator',
      decisionNote: (input.note ?? '').trim().slice(0, 500) || null,
    };
    this.rows.set(next.id, next);
    return next;
  }

  listByUser(userId: string): ResidencyApplication[] {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }

  listOpen(cohortSlug?: string): ResidencyApplication[] {
    return [...this.rows.values()].filter((r) => r.status === 'applied' && (cohortSlug ? r.cohortSlug === cohortSlug : true));
  }

  listAccepted(cohortSlug?: string): ResidencyApplication[] {
    return [...this.rows.values()].filter((r) => r.status === 'accepted' && (cohortSlug ? r.cohortSlug === cohortSlug : true));
  }

  /**
   * L3 — cohort counts by status. Empty cohort → zeros (not invent applicants).
   */
  cohortSummary(cohortSlug: string): {
    readonly cohortSlug: string;
    readonly applied: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly withdrawn: number;
    readonly total: number;
  } {
    const slug = assertCohortSlug(cohortSlug);
    let applied = 0;
    let accepted = 0;
    let rejected = 0;
    let withdrawn = 0;
    for (const r of this.rows.values()) {
      if (r.cohortSlug !== slug) continue;
      if (r.status === 'applied') applied += 1;
      else if (r.status === 'accepted') accepted += 1;
      else if (r.status === 'rejected') rejected += 1;
      else if (r.status === 'withdrawn') withdrawn += 1;
    }
    return {
      cohortSlug: slug,
      applied,
      accepted,
      rejected,
      withdrawn,
      total: applied + accepted + rejected + withdrawn,
    };
  }

  /**
   * L3 — open (applied) applications for one user. Missing user → empty list.
   */
  openForUser(userId: string): readonly ResidencyApplication[] {
    const id = userId.trim();
    if (!id) return [];
    return [...this.rows.values()].filter((r) => r.userId === id && r.status === 'applied');
  }

  /** Applicant withdraws while still applied — no invent accept. */
  withdraw(input: { id: string; userId: string; now?: Date }): ResidencyApplication {
    const row = this.rows.get(input.id);
    if (!row) throw new ResidencyError('Application not found', 'academy.residency_not_found');
    if (row.userId !== input.userId.trim()) {
      throw new ResidencyError('Application not found', 'academy.residency_not_found');
    }
    if (row.status !== 'applied') {
      throw new ResidencyError(`Application is ${row.status}`, 'academy.residency_not_pending');
    }
    const next: ResidencyApplication = {
      ...row,
      status: 'withdrawn',
      decidedAt: input.now ?? new Date(),
      decidedBy: input.userId.trim(),
      decisionNote: 'withdrawn by applicant',
    };
    this.rows.set(next.id, next);
    return next;
  }

  /**
   * L3 — distinct cohort slugs that have any application (any status).
   * Empty desk → [] (never invent cohorts).
   */
  knownCohortSlugs(): readonly string[] {
    const set = new Set<string>();
    for (const r of this.rows.values()) set.add(r.cohortSlug);
    return [...set].sort();
  }

  /** L3 — open (applied) count across all cohorts — operator queue depth. */
  openCount(): number {
    return this.listOpen().length;
  }

  /** L3 — accepted count across all cohorts. Empty → 0. */
  acceptedCount(): number {
    return [...this.rows.values()].filter((r) => r.status === 'accepted').length;
  }

  /**
   * L3 — sorted open application ids. Empty desk → [] (never invent).
   */
  openApplicationIds(): readonly string[] {
    return this.listOpen()
      .map((r) => r.id)
      .sort();
  }

  /** L3 — rejected count across all cohorts. Empty → 0. */
  rejectedCount(): number {
    return [...this.rows.values()].filter((r) => r.status === 'rejected').length;
  }

  /** L3 — withdrawn count across all cohorts. Empty → 0. */
  withdrawnCount(): number {
    return [...this.rows.values()].filter((r) => r.status === 'withdrawn').length;
  }

  /**
   * L3 — sorted rejected application ids. Empty → [] (never invent).
   */
  rejectedApplicationIds(): readonly string[] {
    return [...this.rows.values()]
      .filter((r) => r.status === 'rejected')
      .map((r) => r.id)
      .sort();
  }

  /**
   * L3 — sorted accepted application ids. Empty → [] (never invent).
   */
  acceptedApplicationIds(): readonly string[] {
    return [...this.rows.values()]
      .filter((r) => r.status === 'accepted')
      .map((r) => r.id)
      .sort();
  }

  /**
   * L3 — sorted withdrawn application ids. Empty → [] (never invent).
   */
  withdrawnApplicationIds(): readonly string[] {
    return [...this.rows.values()]
      .filter((r) => r.status === 'withdrawn')
      .map((r) => r.id)
      .sort();
  }

  /** L3 — total applications any status. Empty → 0. */
  applicationCount(): number {
    return this.rows.size;
  }

  /**
   * L3 — true when user has at least one applied application. Missing → false.
   */
  hasOpenApplication(userId: string): boolean {
    return this.openForUser(userId).length > 0;
  }

  /** L3 — open application count for one user. Missing → 0. */
  openApplicationCount(userId: string): number {
    return this.openForUser(userId).length;
  }

  /** L3 — alias of rejectedCount. */
  rejectedApplicationCount(): number {
    return this.rejectedCount();
  }

  /** L3 — alias of acceptedCount. */
  acceptedApplicationCount(): number {
    return this.acceptedCount();
  }

  /** L3 — alias of withdrawnCount. */
  withdrawnApplicationCount(): number {
    return this.withdrawnCount();
  }
  /**
   * L3 — applied (open queue) count. Empty → 0.
   */
  appliedApplicationCount(): number {
    return this.openCount();
  }

  /**
   * L3 — sorted applied application ids. Empty → [].
   */
  appliedApplicationIds(): readonly string[] {
    return this.openApplicationIds();
  }

  /**
   * L3 — open/total as fixed 4dp string. Empty desk → null (never invent 0 queue).
   */
  openApplicationRatio(): string | null {
    const total = this.rows.size;
    if (total === 0) return null;
    return (this.openCount() / total).toFixed(4);
  }

  /**
   * L3 — true when desk has any application row. Empty → false.
   */
  hasAnyApplication(): boolean {
    return this.rows.size > 0;
  }

  /**
   * L3 — true when desk has zero open (applied) apps. Empty → true.
   */
  hasNoOpenApplications(): boolean {
    return this.openCount() === 0;
  }

  /**
   * L3 — accepted/total as fixed 4dp. Empty desk → null (never invent 0 accept).
   */
  acceptedApplicationRatio(): string | null {
    const total = this.rows.size;
    if (total === 0) return null;
    return (this.acceptedCount() / total).toFixed(4);
  }

  /**
   * L3 — rejected/total as fixed 4dp. Empty → null.
   */
  rejectedApplicationRatio(): string | null {
    const total = this.rows.size;
    if (total === 0) return null;
    return (this.rejectedCount() / total).toFixed(4);
  }

  /**
   * L3 — sorted cohort slugs that appear in any application. Empty → [].
   */
  knownCohortSlugsSorted(): readonly string[] {
    const set = new Set<string>();
    for (const r of this.rows.values()) set.add(r.cohortSlug);
    return [...set].sort();
  }

  /** L3 — true when any application is accepted. Empty → false. */
  hasAcceptedApplication(): boolean {
    return this.acceptedCount() > 0;
  }

  /** L3 — true when any application is rejected. Empty → false. */
  hasRejectedApplication(): boolean {
    return this.rejectedCount() > 0;
  }

  /**
   * L3 — withdrawn/total as fixed 4dp. Empty → null.
   */
  withdrawnApplicationRatio(): string | null {
    const total = this.rows.size;
    if (total === 0) return null;
    return (this.withdrawnCount() / total).toFixed(4);
  }

  /**
   * L3 — decided count (accepted+rejected+withdrawn). Empty → 0.
   */
  decidedApplicationCount(): number {
    return this.acceptedCount() + this.rejectedCount() + this.withdrawnCount();
  }

  /** L3 — true when any application is withdrawn. Empty → false. */
  hasWithdrawnApplication(): boolean {
    return this.withdrawnCount() > 0;
  }

  /**
   * L3 — decided/total as fixed 4dp. Empty → null.
   */
  decidedApplicationRatio(): string | null {
    const total = this.rows.size;
    if (total === 0) return null;
    return (this.decidedApplicationCount() / total).toFixed(4);
  }

  /** L3 — true when desk has only applied (no decisions yet). Empty → false. */
  isAllOpen(): boolean {
    return this.rows.size > 0 && this.openCount() === this.rows.size;
  }

  /** L3 — first open application id (sorted). None → null. */
  firstOpenApplicationId(): string | null {
    const ids = this.openApplicationIds();
    return ids[0] ?? null;
  }
}
