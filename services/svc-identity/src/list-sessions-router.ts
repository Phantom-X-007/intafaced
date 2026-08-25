import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import { listSessions, ListSessionsError } from './auth/list-sessions.js';

/**
 * Top-level list (not nested under auth) so mergeRouters cannot replace
 * auth.logout. identity:read (write implies read). Named userId required.
 * Live seats only. No refresh hash.
 */
export function createListSessionsRouter(sql: Sql) {
  return router({
    listSessions: scopedProcedure('identity:read')
      .input(z.object({ userId: z.string().uuid() }))
      .output(
        z.object({
          userId: z.string().uuid(),
          sessions: z.array(
            z.object({
              id: z.string().uuid(),
              createdAt: z.string(),
              revoked: z.literal(false),
            }),
          ),
        }),
      )
      .query(async ({ input }) => {
        try {
          const out = await listSessions(sql, input.userId);
          return {
            userId: out.userId,
            sessions: out.sessions.map((s) => ({
              id: s.id,
              createdAt: s.createdAt.toISOString(),
              revoked: false as const,
            })),
          };
        } catch (err) {
          if (err instanceof ListSessionsError) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
          }
          throw err;
        }
      }),
  });
}
