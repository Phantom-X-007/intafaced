import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import type { Sql } from 'postgres';
import type { ApiKeyMinter } from './auth/mint-api-key-ip.js';
import { rotateApiKey, RotateApiKeyError } from './auth/rotate-api-key.js';

/**
 * Top-level rotate (not nested under apiKeys) so mergeRouters cannot
 * replace apiKeys.exchange. identity:write. No invented secret.
 */
export function createApiKeyRotateRouter(sql: Sql, minter: ApiKeyMinter) {
  return router({
    rotateApiKey: scopedProcedure('identity:write')
      .input(z.object({ keyId: z.string().uuid() }))
      .output(
        z.object({
          id: z.string(),
          key: z.string(),
          prefix: z.string(),
          mode: z.enum(['live', 'sandbox']),
          revokedKeyId: z.string(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await rotateApiKey(minter, sql, {
            userId: ctx.principal.userId,
            keyId: input.keyId,
            grantorScopes: ctx.principal.scopes,
          });
        } catch (err) {
          if (err instanceof RotateApiKeyError) {
            throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
          }
          throw new TRPCError({ code: 'BAD_REQUEST', message: (err as Error).message, cause: err });
        }
      }),
  });
}
