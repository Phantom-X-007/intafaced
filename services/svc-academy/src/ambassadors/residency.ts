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
}
