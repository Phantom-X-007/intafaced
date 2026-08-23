import { describe, expect, it } from 'vitest';
import {
  OPS_CONTACT_REQUIRED,
  OPS_IDENTITY_UNWIRED,
  OPS_PAYROLL_INVENT_FORBIDDEN,
  OPS_PROJECT_REQUIRED,
  OPS_SUPPORT_UNWIRED,
  OPS_WAREHOUSE_UNWIRED,
} from './codes.js';
import { OpsService } from './ops-service.js';

const wiredWarehouse = {
  ANALYTICS_REPLICA_CONFIGURED: 'true',
  ANALYTICS_REPLICA_LAG_SECONDS: '10',
};

describe('OpsService', () => {
  it('blank warehouse refuses ops.warehouse_unwired — no invented revenue', async () => {
    const ops = new OpsService({ warehouseEnv: {} });
    await expect(ops.revenue()).rejects.toMatchObject({ code: OPS_WAREHOUSE_UNWIRED });
  });

  it('wired empty warehouse is empty, not $0', async () => {
    const ops = new OpsService({ warehouseEnv: wiredWarehouse });
    const rev = await ops.revenue();
    expect(rev.empty).toBe(true);
    expect(rev.points).toEqual([]);
    expect(rev.status).toBe('empty');
    expect(JSON.stringify(rev)).not.toMatch(/\$0|0\.00/);
  });

  it('wired cubes keep amounts as strings', async () => {
    const ops = new OpsService({
      warehouseEnv: wiredWarehouse,
      facts: [{ metricId: 'ledger.volume.notional', value: '250.25' }],
    });
    const rev = await ops.revenue();
    expect(rev.empty).toBe(false);
    expect(rev.points[0]?.value).toBe('250.25');
    expect(typeof rev.points[0]?.value).toBe('string');
  });

  it('createContact then list includes the local row; identity/support named absent', async () => {
    const ops = new OpsService({ id: () => 'c1' });
    const created = ops.createContact({ displayName: 'Ada', email: 'ada@example.com' });
    expect(created.source).toBe('local');
    const list = await ops.listContacts();
    expect(list.contacts).toEqual([created]);
    expect(list.identity).toEqual({ status: 'absent', code: OPS_IDENTITY_UNWIRED });
    expect(list.support).toEqual({ status: 'absent', code: OPS_SUPPORT_UNWIRED });
  });

  it('blank contact name refuses rather than inventing a row', () => {
    const ops = new OpsService();
    expect(() => ops.createContact({ displayName: '  ' })).toThrowError(expect.objectContaining({ code: OPS_CONTACT_REQUIRED }));
  });

  it('team directory has no payroll field; inventPayroll is named forbidden', async () => {
    const ops = new OpsService({ id: () => 'm1' });
    const member = ops.createTeamMember({ handle: 'ada', role: 'operator' });
    expect(member).toEqual({ id: 'm1', handle: 'ada', role: 'operator' });
    expect(member).not.toHaveProperty('salary');
    const team = await ops.listTeam();
    expect(team.payroll).toEqual({ forbidden: true, code: OPS_PAYROLL_INVENT_FORBIDDEN });
    expect(() => ops.createTeamMember({ handle: 'ada', salary: '90000' })).toThrowError(
      expect.objectContaining({ code: OPS_PAYROLL_INVENT_FORBIDDEN }),
    );
    expect(() => ops.inventPayroll({})).toThrowError(expect.objectContaining({ code: OPS_PAYROLL_INVENT_FORBIDDEN }));
  });

  it('projects.create then list; blank title refuses', () => {
    const ops = new OpsService({ id: () => 'p1' });
    const project = ops.createProject({ title: 'Lane K' });
    expect(ops.listProjects().projects).toEqual([project]);
    expect(() => ops.createProject({ title: '' })).toThrowError(expect.objectContaining({ code: OPS_PROJECT_REQUIRED }));
  });
});
