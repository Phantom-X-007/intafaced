import {
  queryWarehouseSurface,
  resolveEtlWatermark,
  resolveWarehouseReplicaConfig,
  type CubeFactRow,
  type CubePoint,
} from '@intafaced/contracts';
import {
  OPS_CONTACT_REQUIRED,
  OPS_IDENTITY_UNWIRED,
  OPS_PAYROLL_INVENT_FORBIDDEN,
  OPS_PROJECT_REQUIRED,
  OPS_SUPPORT_UNWIRED,
  OPS_TEAM_HANDLE_REQUIRED,
  OPS_WAREHOUSE_LAG_STALE,
  OPS_WAREHOUSE_LAG_UNKNOWN,
  OPS_WAREHOUSE_UNWIRED,
  OpsError,
} from './codes.js';

export type ContactSource = 'local' | 'identity' | 'support';

export type Contact = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly source: ContactSource;
};

export type TeamMember = {
  readonly id: string;
  readonly handle: string;
  readonly role: string;
};

export type Project = {
  readonly id: string;
  readonly title: string;
  readonly status: 'open';
};

export type SourcedRows<T> = {
  readonly status: 'ok' | 'absent';
  readonly code?: string;
  readonly rows: readonly T[];
};

export type RevenuePoint = {
  metricId: string;
  value: string;
  dim: string | null;
};

export type RevenueResult = {
  empty: boolean;
  status: 'ok' | 'empty';
  mayLabelLive: boolean;
  freshness: string;
  points: RevenuePoint[];
};

export type ContactsResult = {
  contacts: Contact[];
  identity: { status: 'ok' | 'absent'; code?: string };
  support: { status: 'ok' | 'absent'; code?: string };
};

export type TeamResult = {
  members: TeamMember[];
  identity: { status: 'ok' | 'absent'; code?: string };
  payroll: { forbidden: true; code: typeof OPS_PAYROLL_INVENT_FORBIDDEN };
};

const PAYROLL_KEYS = ['salary', 'compensation', 'payroll', 'wage', 'pay'] as const;

export interface OpsServiceDeps {
  readonly warehouseEnv?: Record<string, string | undefined>;
  readonly identitySource?: () => Promise<SourcedRows<Contact>>;
  readonly supportSource?: () => Promise<SourcedRows<Contact>>;
  readonly identityTeamSource?: () => Promise<SourcedRows<TeamMember>>;
  readonly facts?: readonly CubeFactRow[] | null;
  readonly now?: () => Date;
  readonly id?: () => string;
}

function absent<T>(code: string): SourcedRows<T> {
  return { status: 'absent', code, rows: [] };
}

export class OpsService {
  private readonly warehouseEnv: Record<string, string | undefined>;
  private readonly identitySource: () => Promise<SourcedRows<Contact>>;
  private readonly supportSource: () => Promise<SourcedRows<Contact>>;
  private readonly identityTeamSource: () => Promise<SourcedRows<TeamMember>>;
  private readonly facts: readonly CubeFactRow[];
  private readonly id: () => string;
  private readonly contacts = new Map<string, Contact>();
  private readonly members = new Map<string, TeamMember>();
  private readonly projects = new Map<string, Project>();

  constructor(deps: OpsServiceDeps = {}) {
    this.warehouseEnv = deps.warehouseEnv ?? {};
    this.identitySource = deps.identitySource ?? (async () => absent<Contact>(OPS_IDENTITY_UNWIRED));
    this.supportSource = deps.supportSource ?? (async () => absent<Contact>(OPS_SUPPORT_UNWIRED));
    this.identityTeamSource = deps.identityTeamSource ?? (async () => absent<TeamMember>(OPS_IDENTITY_UNWIRED));
    this.facts = deps.facts ?? [];
    this.id = deps.id ?? (() => crypto.randomUUID());
  }

  async listContacts(): Promise<ContactsResult> {
    const identity = await this.identitySource();
    const support = await this.supportSource();
    const local = [...this.contacts.values()];
    const seen = new Set(local.map((c) => c.id));
    const sourced: Contact[] = [];
    for (const row of [...identity.rows, ...support.rows]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      sourced.push(row);
    }
    return {
      contacts: [...local, ...sourced],
      identity: { status: identity.status, code: identity.code },
      support: { status: support.status, code: support.code },
    };
  }

  createContact(input: { displayName?: string; email?: string | null }): Contact {
    const displayName = (input.displayName ?? '').trim();
    if (!displayName) {
      throw new OpsError(OPS_CONTACT_REQUIRED, 'A contact needs a name — nothing was invented');
    }
    const emailRaw = (input.email ?? '').trim();
    const contact: Contact = {
      id: this.id(),
      displayName,
      email: emailRaw.length > 0 ? emailRaw : null,
      source: 'local',
    };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async listTeam(): Promise<TeamResult> {
    const identity = await this.identityTeamSource();
    const local = [...this.members.values()];
    const seen = new Set(local.map((m) => m.id));
    const sourced: TeamMember[] = [];
    for (const row of identity.rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      sourced.push(row);
    }
    return {
      members: [...local, ...sourced],
      identity: { status: identity.status, code: identity.code },
      payroll: { forbidden: true, code: OPS_PAYROLL_INVENT_FORBIDDEN },
    };
  }

  createTeamMember(input: Record<string, unknown>): TeamMember {
    this.refusePayroll(input);
    const handle = typeof input.handle === 'string' ? input.handle.trim() : '';
    const role = typeof input.role === 'string' ? input.role.trim() : 'member';
    if (!handle) {
      throw new OpsError(OPS_TEAM_HANDLE_REQUIRED, 'A directory row needs a handle — payroll was not invented either');
    }
    const member: TeamMember = { id: this.id(), handle, role: role.length > 0 ? role : 'member' };
    this.members.set(member.id, member);
    return member;
  }

  inventPayroll(_input: Record<string, unknown>): never {
    throw new OpsError(OPS_PAYROLL_INVENT_FORBIDDEN, 'Payroll is not built and must not be invented');
  }

  async revenue(): Promise<RevenueResult> {
    const resolved = await resolveWarehouseReplicaConfig({ env: this.warehouseEnv });
    if (resolved.status === 'refuse' || !resolved.replicaConfigured) {
      throw new OpsError(OPS_WAREHOUSE_UNWIRED, 'Analytics warehouse replica is not wired. No invented revenue.');
    }
    const etl = resolveEtlWatermark(this.warehouseEnv);
    const surface = queryWarehouseSurface({
      replicaConfigured: true,
      lagSeconds: resolved.lagSeconds,
      lagMeasuredAt: resolved.lagMeasuredAt,
      lagSource: resolved.lagSource,
      facts: this.facts,
      etlWatermark: etl.state,
      etlWatermarkAt: etl.at,
    });
    if (surface.status === 'unavailable') {
      if (surface.reason === 'replica_unconfigured') {
        throw new OpsError(OPS_WAREHOUSE_UNWIRED, 'Analytics warehouse replica is not wired. No invented revenue.');
      }
      if (surface.reason === 'lag_stale') {
        throw new OpsError(OPS_WAREHOUSE_LAG_STALE, 'Warehouse lag is stale. No invented revenue.');
      }
      throw new OpsError(OPS_WAREHOUSE_LAG_UNKNOWN, 'Warehouse lag is unknown. No invented revenue.');
    }
    if (surface.status === 'refuse') {
      throw new OpsError(OPS_WAREHOUSE_UNWIRED, surface.reason);
    }
    const points: CubePoint[] = surface.status === 'ok' ? [...surface.points] : [];
    const freshness = surface.freshness;
    return {
      empty: surface.status === 'empty' || points.length === 0,
      status: surface.status === 'ok' && points.length > 0 ? 'ok' : 'empty',
      mayLabelLive: surface.mayLabelLive,
      freshness,
      points: points.map((p) => ({ metricId: p.metricId, value: p.value, dim: p.dim ?? null })),
    };
  }

  listProjects(): { projects: Project[] } {
    return { projects: [...this.projects.values()] };
  }

  createProject(input: { title?: string }): Project {
    const title = (input.title ?? '').trim();
    if (!title) {
      throw new OpsError(OPS_PROJECT_REQUIRED, 'A project needs a title — the list stays empty rather than fake');
    }
    const project: Project = { id: this.id(), title, status: 'open' };
    this.projects.set(project.id, project);
    return project;
  }

  private refusePayroll(input: Record<string, unknown>): void {
    for (const key of PAYROLL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(input, key) && input[key] != null && input[key] !== '') {
        throw new OpsError(OPS_PAYROLL_INVENT_FORBIDDEN, 'Payroll is not built and must not be invented');
      }
    }
  }
}
