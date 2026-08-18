import { z } from 'zod';
import { router, scopedProcedure, TRPCError } from '@intafaced/contracts';
import { requireMfa } from '@intafaced/auth';
import { assertOperatorKycReview, type AuthService } from './auth/auth-service.js';
import type { KycDocumentVault } from './kyc/document-store.js';
import type { BindProviderRefInput, BindProviderRefResult } from './kyc/provider-ref-bind.js';
import {
  toTrpcError,
  presentKyc,
  presentDocMeta,
  kycRecordOutput,
  kycDocMetaOutput,
  submittableTier,
} from './router-shared.js';

export function createKycRouter(args: {
  auth: AuthService;
  requireKycDocs: () => KycDocumentVault;
  requireBindKyc: () => (input: BindProviderRefInput) => Promise<BindProviderRefResult>;
}) {
  const { auth, requireKycDocs, requireBindKyc } = args;
  return router({
      /**
       * A user asks to be verified. Grants nothing.
       *
       * There is no `userId` input, so there is no way to submit on somebody
       * else's behalf — the identity comes from the token and cannot be
       * overridden. An ownership check would be a check on a value the caller
       * supplies; not accepting the value is stronger.
       */
      submit: scopedProcedure('identity:write')
        .input(
          z.object({
            tier: submittableTier,
            /** ISO-3166 alpha-2. The matrix is keyed on it, so it is not free text. */
            jurisdiction: z.string().length(2).toUpperCase(),
            /**
             * Deliberately absent: a client-supplied `providerRef` was a free-text
             * side-channel into `kyc_records.provider_ref` (§10 PII isolation —
             * "pointer never holds a name or DOB"). Opaque refs are minted by the
             * encrypted document store (or operator tools) when that store lands;
             * user submit only opens a pending row.
             */
          }),
        )
        .output(kycRecordOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            return presentKyc(
              await auth.submitKyc({
                userId: ctx.principal.userId,
                tier: input.tier,
                jurisdiction: input.jurisdiction,
              }),
            );
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** The caller's own records, and the tier they currently add up to. */
      status: scopedProcedure('identity:read')
        .output(z.object({ tier: z.enum(['none', 'basic', 'full', 'institutional']), records: z.array(kycRecordOutput) }))
        .query(async ({ ctx }) => ({
          // Read from the same function the token issuer uses, rather than
          // re-deriving "highest approved, unexpired" here. Two implementations
          // of that rule would eventually disagree, and the one the user is
          // shown is not the one that decides what they can do.
          tier: await auth.kycTier(ctx.principal.userId),
          records: (await auth.listKycRecords(ctx.principal.userId)).map(presentKyc),
        })),

      /**
       * THE OPERATOR ACTION — THIS GRANTS TRADING ACCESS.
       *
       * `admin:compliance`, which no user session carries, plus an explicit
       * second-factor check.
       *
       * WHY `requireMfa` IS HERE AND NOT IMPLIED BY THE SCOPE.
       * `INTERACTIVE_ONLY_SCOPES` is what forces 2FA on a scope, and
       * `admin:compliance` is NOT in that list — its stated membership test is
       * "does this move value OFF the platform", and approving a record moves
       * nothing. But it is a privilege-escalation primitive: a leaked operator
       * key that can self-approve an account to `institutional` unlocks every
       * custodial module in the OS. So the second factor is enforced here,
       * locally, and the question of whether the shared list should grow is
       * argued in the PR rather than settled by editing a shared package inside
       * a service PR (§15.2).
       */
      approve: scopedProcedure('admin:compliance')
        .input(
          z.object({
            recordId: z.string().uuid(),
            /** When the verification lapses. Null means it does not. */
            expiresAt: z.string().datetime({ offset: true }).nullish(),
          }),
        )
        .output(kycRecordOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            assertOperatorKycReview({ service: ctx.service, kid: ctx.principal.kid });
            return presentKyc(
              await auth.approveKycRecord({
                recordId: input.recordId,
                reviewerId: ctx.principal.userId,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                service: ctx.service,
                kid: ctx.principal.kid,
              }),
            );
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** The other half of a review. Grants nothing and announces nothing. */
      reject: scopedProcedure('admin:compliance')
        .input(z.object({ recordId: z.string().uuid() }))
        .output(kycRecordOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            assertOperatorKycReview({ service: ctx.service, kid: ctx.principal.kid });
            return presentKyc(
              await auth.rejectKycRecord({
                recordId: input.recordId,
                reviewerId: ctx.principal.userId,
                service: ctx.service,
                kid: ctx.principal.kid,
              }),
            );
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /** The review queue. Without it `approve` needs a record id nobody can find. */
      pending: scopedProcedure('admin:compliance')
        .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
        .output(z.array(kycRecordOutput))
        .query(async ({ input }) => (await auth.listPendingKyc(input?.limit ?? 50)).map(presentKyc)),

      /**
       * §10 — operator stores a KYC document into the encrypted vault.
       *
       * Returns meta + opaque id only. NEVER returns plaintext/ciphertext.
       * Live vendor webhook remains Class X; this is the in-house store path.
       * MFA required: same privilege class as approve (document = PII grant prep).
       */
      storeDocument: scopedProcedure('admin:compliance')
        .input(
          z.object({
            userId: z.string().uuid(),
            contentType: z.string().min(1).max(128),
            /** Base64 document bytes (max 10 MiB decoded). */
            bytesBase64: z.string().min(1).max(14_000_000),
          }),
        )
        .output(kycDocMetaOutput)
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            const vault = requireKycDocs();
            let bytes: Buffer;
            try {
              bytes = Buffer.from(input.bytesBase64, 'base64');
            } catch {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'bytesBase64 is not valid base64' });
            }
            // Empty after decode is a put refusal from the store; reject early for a clean code.
            if (bytes.length === 0) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'Document bytes empty' });
            }
            return presentDocMeta(
              await vault.put({
                userId: input.userId,
                contentType: input.contentType,
                bytes,
                storedBy: ctx.principal.userId,
              }),
            );
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * §10 — operator opens one KYC document through IDENTITY_KYC_DOC_KEY.
       *
       * Decrypts only for a compliance principal. Blank key refuses first —
       * no invented AES key, no plaintext. MFA required (same class as store).
       */
      getDocument: scopedProcedure('admin:compliance')
        .input(z.object({ documentId: z.string().uuid() }))
        .output(kycDocMetaOutput.extend({ bytesBase64: z.string() }))
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            const vault = requireKycDocs();
            const opened = await vault.getFor(input.documentId, {
              kind: 'compliance',
              operatorId: ctx.principal.userId,
            });
            return {
              ...presentDocMeta(opened.meta),
              bytesBase64: opened.bytes.toString('base64'),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Meta-only list for one subject. No document bytes on the wire.
       * Compliance scope only — not a free userId lookup for ordinary sessions.
       */
      listDocuments: scopedProcedure('admin:compliance')
        .input(z.object({ userId: z.string().uuid() }))
        .output(z.array(kycDocMetaOutput))
        .query(async ({ input }) => {
          try {
            const vault = requireKycDocs();
            return (await vault.listMetaForUser(input.userId)).map(presentDocMeta);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Bind vault document id as kyc_records.provider_ref for a pending record.
       * Ownership of the document must match the record subject — cross-user bind refused.
       * Returns the opaque pointer only (never bytes).
       */
      bindDocument: scopedProcedure('admin:compliance')
        .input(
          z.object({
            recordId: z.string().uuid(),
            documentId: z.string().uuid(),
          }),
        )
        .output(
          z.object({
            recordId: z.string().uuid(),
            userId: z.string().uuid(),
            providerRef: z.string().uuid(),
            document: kycDocMetaOutput,
          }),
        )
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            const bind = requireBindKyc();
            const result = await bind({
              recordId: input.recordId,
              documentId: input.documentId,
              operatorId: ctx.principal.userId,
            });
            return {
              recordId: result.recordId,
              userId: result.userId,
              providerRef: result.providerRef,
              document: presentDocMeta(result.document),
            };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
  });
}
