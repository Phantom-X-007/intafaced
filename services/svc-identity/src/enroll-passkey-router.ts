import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import {
  beginEnrollPasskey,
  enrollPasskey,
  EnrollPasskeyError,
  sqlPasskeyChallenges,
  type PasskeyRp,
} from './auth/enroll-passkey.js';

const registrationResponse = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: z.string().min(1),
    attestationObject: z.string().min(1),
    transports: z.array(z.string()).optional(),
  }),
  clientExtensionResults: z.record(z.unknown()).optional(),
});

/**
 * Top-level enroll (not nested under webauthn) so mergeRouters cannot replace
 * webauthn.registerVerify. identity:write. RP id/origin required. No invented secret.
 */
export function createEnrollPasskeyRouter(sql: Sql, rp: PasskeyRp) {
  const challenges = sqlPasskeyChallenges(sql);
  return router({
    beginEnrollPasskey: scopedProcedure('identity:write').mutation(async ({ ctx }) => {
      try {
        return await beginEnrollPasskey(sql, ctx.principal.userId, rp, challenges);
      } catch (err) {
        if (err instanceof EnrollPasskeyError) {
          if (err.code === 'auth.not_found') {
            throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
          }
          throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
        }
        throw err;
      }
    }),
    enrollPasskey: scopedProcedure('identity:write')
      .input(registrationResponse)
      .output(z.object({ credentialId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await enrollPasskey(sql, ctx.principal.userId, rp, input, challenges);
        } catch (err) {
          if (err instanceof EnrollPasskeyError) {
            if (err.code === 'auth.not_found') {
              throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
            }
            throw new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
          }
          throw err;
        }
      }),
  });
}
