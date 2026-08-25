/**
 * Start one already-approved TWAP/VWAP/POV parent.
 *
 * Marks an injected approved parent `running` so children may take new later.
 * This door never creates the parent, never plans slices, never ticks,
 * never places children, and does not touch matching.
 */

export type AlgoKind = 'twap' | 'vwap' | 'pov';
export type ApprovedAlgoStatus = 'approved' | 'running' | 'stopped' | 'undeployed' | 'expired' | 'paper';

export type RetainedAlgoSchedule = {
  readonly durationMs: number;
  readonly sliceIntervalMs: number;
  readonly slicesPlanned: number;
  readonly participationBps: number | null; // POV only; null on TWAP/VWAP
  readonly expireAt?: string | null;
};

export type RetainedParentResidual = {
  readonly remaining: string;
  readonly released?: boolean;
};

export type ApprovedAlgoParent = {
  readonly parentClientOrderId: string;
  readonly kind: AlgoKind;
  readonly status: ApprovedAlgoStatus;
  readonly schedule: RetainedAlgoSchedule;
  readonly startedAt: string | null;
  readonly residual?: RetainedParentResidual | null;
  /** Current execution owner. Null/absent = unowned. Never invent an operator. */
  readonly executionOwner?: string | null;
  /** Named target of an offered pass. Null/absent = no pending handoff. Owner stays responsible until accept. */
  readonly pendingPassTo?: string | null;
  /** Caller-supplied pass deadline. Null/absent = no pending pass timeout. Never invent from duration or the clock. */
  readonly pendingPassExpireAt?: string | null;
};

export interface ApprovedAlgoParentStore {
  get(parentClientOrderId: string): ApprovedAlgoParent | null;
  approve(parent: ApprovedAlgoParent): ApprovedAlgoParent;
  start(parentClientOrderId: string, startedAt: string): ApprovedAlgoParent | null;
  stop(parentClientOrderId: string): ApprovedAlgoParent | null;
  undeploy(parentClientOrderId: string): ApprovedAlgoParent | null;
  expire(parentClientOrderId: string): ApprovedAlgoParent | null;
  releaseResidual?(parentClientOrderId: string): ApprovedAlgoParent | null;
  paper?(parentClientOrderId: string): ApprovedAlgoParent | null;
  promote?(parentClientOrderId: string): ApprovedAlgoParent | null;
  claim?(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null;
  unclaim?(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null;
  offerPass?(parentClientOrderId: string, fromOperatorId: string, toOperatorId: string, expireAt: string): ApprovedAlgoParent | null;
  acceptPass?(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null;
  rejectPass?(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null;
  timeoutPass?(parentClientOrderId: string): ApprovedAlgoParent | null;
}

export class InMemoryApprovedAlgoParentStore implements ApprovedAlgoParentStore {
  private readonly rows = new Map<string, ApprovedAlgoParent>();

  /** Tests only — never invent an approved parent on the live host. */
  seed(parent: ApprovedAlgoParent): void {
    this.rows.set(parent.parentClientOrderId, cloneParent(parent));
  }

  get(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    return row ? cloneParent(row) : null;
  }

  approve(parent: ApprovedAlgoParent): ApprovedAlgoParent {
    const next = cloneParent({ ...parent, status: 'approved', startedAt: null });
    this.rows.set(parent.parentClientOrderId, next);
    return cloneParent(next);
  }

  start(parentClientOrderId: string, startedAt: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const next = cloneParent({ ...row, status: 'running', startedAt });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  stop(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    if (row.status !== 'running') return null;
    const next = cloneParent({ ...row, status: 'stopped' });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  undeploy(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    if (row.status !== 'stopped') return null;
    const next = cloneParent({ ...row, status: 'undeployed' });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  expire(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const expireAt = row.schedule.expireAt?.trim();
    if (!expireAt) return null;
    const next = cloneParent({ ...row, status: 'expired' });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  releaseResidual(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const remaining = row.residual?.remaining?.trim();
    if (!remaining) return null;
    const next = cloneParent({
      ...row,
      residual: { remaining, released: true },
    });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  paper(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const next = cloneParent({ ...row, status: 'paper' });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  promote(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    if (row.status !== 'paper') return null;
    const remaining = row.residual?.remaining?.trim();
    if (!remaining) return null;
    if (row.residual?.released === true) return null;
    const next = cloneParent({ ...row, status: 'approved' });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  claim(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const current = row.executionOwner?.trim() ?? '';
    if (current && current !== operatorId) return null;
    const next = cloneParent({ ...row, executionOwner: operatorId });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  unclaim(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const current = row.executionOwner?.trim() ?? '';
    if (!current || current !== operatorId) return null;
    const pending = row.pendingPassTo?.trim() ?? '';
    if (pending) return null;
    const next = cloneParent({ ...row, executionOwner: null });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  offerPass(parentClientOrderId: string, fromOperatorId: string, toOperatorId: string, expireAt: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const current = row.executionOwner?.trim() ?? '';
    if (!current || current !== fromOperatorId) return null;
    if (!toOperatorId || toOperatorId === fromOperatorId) return null;
    const deadline = expireAt.trim();
    if (!deadline) return null;
    const pending = row.pendingPassTo?.trim() ?? '';
    if (pending && pending !== toOperatorId) return null;
    const next = cloneParent({ ...row, pendingPassTo: toOperatorId, pendingPassExpireAt: deadline });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  acceptPass(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const pending = row.pendingPassTo?.trim() ?? '';
    if (!pending || pending !== operatorId) return null;
    const next = cloneParent({
      ...row,
      executionOwner: operatorId,
      pendingPassTo: null,
      pendingPassExpireAt: null,
    });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  rejectPass(parentClientOrderId: string, operatorId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const pending = row.pendingPassTo?.trim() ?? '';
    if (!pending || pending !== operatorId) return null;
    const next = cloneParent({ ...row, pendingPassTo: null, pendingPassExpireAt: null });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }

  timeoutPass(parentClientOrderId: string): ApprovedAlgoParent | null {
    const row = this.rows.get(parentClientOrderId);
    if (!row) return null;
    const pending = row.pendingPassTo?.trim() ?? '';
    if (!pending) return null;
    const deadline = row.pendingPassExpireAt?.trim() ?? '';
    if (!deadline) return null;
    const next = cloneParent({ ...row, pendingPassTo: null, pendingPassExpireAt: null });
    this.rows.set(parentClientOrderId, next);
    return cloneParent(next);
  }
}

export type AlgoJobsGate = { readonly enabled: boolean };

export type OmsStartOk = {
  readonly ok: true;
  readonly started: true;
  readonly parentClientOrderId: string;
  readonly kind: AlgoKind;
  readonly status: 'running';
  readonly schedule: RetainedAlgoSchedule;
  readonly startedAt: string;
};

export type OmsStartRefuse =
  | { readonly ok: false; readonly reason: 'missing_parent'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'parent_store_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'jobs_gate_unwired'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'jobs_off'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_found'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unsupported_kind'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'not_approved'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'already_started'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'missing_schedule'; readonly detail: string };

export type OmsStartResult = OmsStartOk | OmsStartRefuse;

function cloneSchedule(schedule: RetainedAlgoSchedule): RetainedAlgoSchedule {
  return {
    durationMs: schedule.durationMs,
    sliceIntervalMs: schedule.sliceIntervalMs,
    slicesPlanned: schedule.slicesPlanned,
    participationBps: schedule.participationBps,
    ...(schedule.expireAt !== undefined ? { expireAt: schedule.expireAt } : {}),
  };
}

function cloneResidual(residual: ApprovedAlgoParent['residual']): ApprovedAlgoParent['residual'] {
  if (residual == null) return residual;
  return {
    remaining: residual.remaining,
    ...(residual.released !== undefined ? { released: residual.released } : {}),
  };
}

function cloneParent(parent: ApprovedAlgoParent): ApprovedAlgoParent {
  return {
    parentClientOrderId: parent.parentClientOrderId,
    kind: parent.kind,
    status: parent.status,
    schedule: cloneSchedule(parent.schedule),
    startedAt: parent.startedAt,
    ...(parent.residual !== undefined ? { residual: cloneResidual(parent.residual) } : {}),
    ...(parent.executionOwner !== undefined ? { executionOwner: parent.executionOwner } : {}),
    ...(parent.pendingPassTo !== undefined ? { pendingPassTo: parent.pendingPassTo } : {}),
    ...(parent.pendingPassExpireAt !== undefined ? { pendingPassExpireAt: parent.pendingPassExpireAt } : {}),
  };
}

function isAlgoKind(kind: string): kind is AlgoKind {
  return kind === 'twap' || kind === 'vwap' || kind === 'pov';
}

function refuse(reason: OmsStartRefuse['reason'], detail: string): OmsStartRefuse {
  return { ok: false, reason, detail };
}

function scheduleMissing(parent: ApprovedAlgoParent): boolean {
  const { durationMs, sliceIntervalMs, slicesPlanned, participationBps } = parent.schedule;
  if (!(durationMs > 0) || !(sliceIntervalMs > 0) || slicesPlanned < 1) return true;
  if (parent.kind === 'pov' && (participationBps === null || !Number.isInteger(participationBps))) return true;
  return false;
}

export function startApprovedAlgoParent(input: {
  parentClientOrderId?: string;
  parentStore?: ApprovedAlgoParentStore;
  jobs?: AlgoJobsGate;
  now?: Date;
}): OmsStartResult {
  const parentClientOrderId = input.parentClientOrderId?.trim() ?? '';
  if (!parentClientOrderId) {
    return refuse('missing_parent', 'parentClientOrderId is required');
  }
  if (!input.parentStore) {
    return refuse('parent_store_unwired', 'approved algo parent store is required for start');
  }
  if (!input.jobs) {
    return refuse('jobs_gate_unwired', 'algo jobs gate is required for start');
  }
  if (input.jobs.enabled === false) {
    return refuse('jobs_off', 'EXECUTION_ALGO_JOBS_ENABLED is off — refusing to invent a live start');
  }

  const existing = input.parentStore.get(parentClientOrderId);
  if (!existing) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }
  if (!isAlgoKind(existing.kind)) {
    return refuse('unsupported_kind', `kind ${String(existing.kind)} is not twap|vwap|pov`);
  }
  if (existing.status === 'running') {
    return refuse('already_started', `parent ${parentClientOrderId} is already running`);
  }
  if (existing.status !== 'approved') {
    return refuse('not_approved', `parent ${parentClientOrderId} is not approved`);
  }
  if (scheduleMissing(existing)) {
    return refuse('missing_schedule', 'retained schedule is incomplete — refusing to invent slices');
  }

  const startedAt = (input.now ?? new Date()).toISOString();
  const started = input.parentStore.start(parentClientOrderId, startedAt);
  if (!started) {
    return refuse('not_found', `no approved algo parent for ${parentClientOrderId}`);
  }

  return {
    ok: true,
    started: true,
    parentClientOrderId: started.parentClientOrderId,
    kind: started.kind,
    status: 'running',
    schedule: cloneSchedule(started.schedule),
    startedAt,
  };
}
