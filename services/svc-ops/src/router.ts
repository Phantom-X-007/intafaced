import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router, scopedProcedure } from '@intafaced/contracts';
import { OPS_PAYROLL_INVENT_FORBIDDEN, OPS_WAREHOUSE_UNWIRED, OpsError } from './codes.js';
import type { OpsService } from './ops-service.js';

const contactSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().nullable(),
  source: z.enum(['local', 'identity', 'support']),
});

const sourcedMeta = z.object({
  status: z.enum(['ok', 'absent']),
  code: z.string().optional(),
});

const teamMemberSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1),
  role: z.string().min(1),
});

const projectSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.literal('open'),
});

const pointSchema = z.object({
  metricId: z.string().min(1),
  value: z.string(),
  dim: z.string().nullable(),
});

function mapError(err: unknown): never {
  if (err instanceof OpsError) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.code} — ${err.message}`,
      cause: err,
    });
  }
  throw err;
}

const guards = { module: 'core-ops' as const, plane: 'fiat' as const };

export function createOpsRouter(ops: OpsService) {
  return router({
    health: publicProcedure
      .output(z.object({ ok: z.literal(true), service: z.literal('svc-ops'), custodial: z.literal(false) }))
      .query(() => ({ ok: true as const, service: 'svc-ops' as const, custodial: false as const })),

    contacts: scopedProcedure('ops:read', guards)
      .output(
        z.object({
          contacts: z.array(contactSchema),
          identity: sourcedMeta,
          support: sourcedMeta,
        }),
      )
      .query(async () => {
        try {
          const out = await ops.listContacts();
          return { ...out, contacts: [...out.contacts] };
        } catch (err) {
          mapError(err);
        }
      }),

    createContact: scopedProcedure('ops:write', guards)
      .input(z.object({ displayName: z.string(), email: z.string().optional().nullable() }))
      .output(contactSchema)
      .mutation(({ input }) => {
        try {
          return ops.createContact(input);
        } catch (err) {
          mapError(err);
        }
      }),

    team: scopedProcedure('ops:read', guards)
      .output(
        z.object({
          members: z.array(teamMemberSchema),
          identity: sourcedMeta,
          payroll: z.object({
            forbidden: z.literal(true),
            code: z.literal(OPS_PAYROLL_INVENT_FORBIDDEN),
          }),
        }),
      )
      .query(async () => {
        try {
          const out = await ops.listTeam();
          return { ...out, members: [...out.members] };
        } catch (err) {
          mapError(err);
        }
      }),

    createTeamMember: scopedProcedure('ops:write', guards)
      .input(z.object({ handle: z.string().optional(), role: z.string().optional() }).passthrough())
      .output(teamMemberSchema)
      .mutation(({ input }) => {
        try {
          return ops.createTeamMember(input as Record<string, unknown>);
        } catch (err) {
          mapError(err);
        }
      }),

    inventPayroll: scopedProcedure('ops:write', guards)
      .input(z.object({}).passthrough().optional())
      .mutation(() => {
        try {
          ops.inventPayroll({});
        } catch (err) {
          mapError(err);
        }
      }),

    revenue: scopedProcedure('ops:read', guards)
      .output(
        z.object({
          empty: z.boolean(),
          status: z.enum(['ok', 'empty']),
          mayLabelLive: z.boolean(),
          freshness: z.string(),
          points: z.array(pointSchema),
        }),
      )
      .query(async () => {
        try {
          const out = await ops.revenue();
          return { ...out, points: [...out.points] };
        } catch (err) {
          mapError(err);
        }
      }),

    projects: router({
      list: scopedProcedure('ops:read', guards)
        .output(z.object({ projects: z.array(projectSchema) }))
        .query(() => {
          const out = ops.listProjects();
          return { projects: [...out.projects] };
        }),
      create: scopedProcedure('ops:write', guards)
        .input(z.object({ title: z.string() }))
        .output(projectSchema)
        .mutation(({ input }) => {
          try {
            return ops.createProject(input);
          } catch (err) {
            mapError(err);
          }
        }),
    }),
  });
}

export type OpsRouter = ReturnType<typeof createOpsRouter>;

/** Grep anchor for the shell golden. */
export const WAREHOUSE_UNWIRED = OPS_WAREHOUSE_UNWIRED;
export const PAYROLL_INVENT_FORBIDDEN = OPS_PAYROLL_INVENT_FORBIDDEN;
