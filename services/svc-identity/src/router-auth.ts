import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, TRPCError } from '@intafaced/contracts';
import type { AuthService } from './auth/auth-service.js';
import type { ReferralService } from './affiliates/referral-service.js';
import { toTrpcError, sessionOutput } from './router-shared.js';

export function createAuthRouter(args: {
  auth: AuthService;
  registrationOpen: boolean;
  webauthnEnabled: boolean;
  requireReferral: () => ReferralService;
}) {
  const { auth, registrationOpen, webauthnEnabled, requireReferral } = args;
  return router({
      register: publicProcedure
        .input(
          z.object({
            handle: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/, 'handle must be 3-32 letters, numbers or underscores'),
            email: z.string().email(),
            password: z.string().min(12).max(200),
            region: z.string().length(2).optional(),
            /**
             * Optional referrer at signup. Same law as `affiliates.attribute`
             * (self/cycle/depth/unknown refuse loud). Blank = no edge.
             * Account is created first; a failed attribute still leaves the user
             * (they can fix referrer via attribute later if product allows once).
             */
            referrerId: z.string().uuid().optional(),
          }),
        )
        .output(sessionOutput)
        .mutation(async ({ input, ctx }) => {
          if (!registrationOpen) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'Registration is not open yet' });
          }
          try {
            const { referrerId, ...registerInput } = input;
            const session = await auth.register({ ...registerInput, ip: ctx.requestId });
            if (referrerId) {
              await requireReferral().attribute({ userId: session.userId, referrerId });
            }
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      login: publicProcedure
        .input(z.object({ identifier: z.string().min(1), password: z.string().min(1), totpCode: z.string().optional() }))
        .output(sessionOutput)
        .mutation(async ({ input }) => {
          try {
            const session = await auth.login(input);
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      refresh: publicProcedure
        .input(z.object({ refreshToken: z.string().min(1) }))
        .output(sessionOutput)
        .mutation(async ({ input }) => {
          try {
            const session = await auth.refresh(input.refreshToken);
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      logout: publicProcedure
        .input(z.object({ refreshToken: z.string().min(1) }))
        .output(z.object({ ok: z.literal(true) }))
        .mutation(async ({ input }) => {
          await auth.logout(input.refreshToken);
          return { ok: true as const };
        }),

      logoutAll: protectedProcedure.output(z.object({ revoked: z.number() })).mutation(async ({ ctx }) => ({
        revoked: await auth.logoutAll(ctx.principal.userId),
      })),

      /**
       * THE STEP-UP CHALLENGE.
       *
       * `defaultScopes()` withholds `trade:withdraw` — "added only after a
       * step-up challenge" — and there was no step-up challenge anywhere in the
       * OS, which made every withdrawal surface unreachable by a real session.
       * This is that challenge: a live session plus a fresh TOTP / recovery code
       * **or** a WebAuthn assertion (after `stepUpOptions`) buys a five-minute
       * token that carries the scope. Passkey-only accounts can withdraw without
       * TOTP theatre; lost authenticator can still step up via recovery codes.
       *
       * `protectedProcedure`, not `scopedProcedure`: the caller is proving a
       * second factor, not exercising a permission. Requiring a scope to ask for
       * a scope would only mean the answer was already yes.
       */
      /**
       * WebAuthn options for step-up (passkey withdraw). Challenge kind is
       * `step-up` so a passwordless-login assertion cannot be reused here.
       */
      stepUpOptions: protectedProcedure.mutation(async ({ ctx }) => {
        if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
        try {
          return await auth.startWebauthnStepUp(ctx.principal.userId);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

      stepUp: protectedProcedure
        .input(
          z
            .object({
              // 6-digit TOTP or single-use recovery (XXXXX-XXXXX), same field as login.
              totpCode: z
                .string()
                .regex(/^(\d{6}|[0-9A-Fa-f]{5}-[0-9A-Fa-f]{5})$/)
                .optional(),
              webauthn: z
                .object({
                  id: z.string().min(1),
                  rawId: z.string().min(1),
                  type: z.literal('public-key'),
                  response: z.object({
                    clientDataJSON: z.string().min(1),
                    authenticatorData: z.string().min(1),
                    signature: z.string().min(1),
                    userHandle: z.string().nullish(),
                  }),
                  clientExtensionResults: z.record(z.unknown()).optional(),
                })
                .optional(),
            })
            .refine((v) => Boolean(v.totpCode) !== Boolean(v.webauthn), {
              message: 'Provide exactly one of totpCode or webauthn',
            }),
        )
        .output(z.object({ accessToken: z.string(), expiresAt: z.string(), scopes: z.array(z.string()) }))
        .mutation(async ({ ctx, input }) => {
          try {
            const elevated = await auth.stepUp({
              userId: ctx.principal.userId,
              sessionId: ctx.principal.sid,
              totpCode: input.totpCode,
              webauthn: input.webauthn,
            });
            return { ...elevated, expiresAt: elevated.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
  });
}

export function createTotpRouter(args: { auth: AuthService }) {
  const { auth } = args;
  return router({
      enrol: protectedProcedure
        .output(z.object({ secret: z.string(), uri: z.string(), recoveryCodes: z.array(z.string()) }))
        .mutation(async ({ ctx }) => {
          try {
            return await auth.startTotpEnrolment(ctx.principal.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      confirm: protectedProcedure
        .input(z.object({ secret: z.string().min(16), code: z.string().regex(/^\d{6}$/) }))
        .output(z.object({ ok: z.literal(true) }))
        .mutation(async ({ ctx, input }) => {
          try {
            await auth.confirmTotpEnrolment(ctx.principal.userId, input.secret, input.code);
            return { ok: true as const };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
  });
}

export function createWebauthnRouter(args: { auth: AuthService; webauthnEnabled: boolean }) {
  const { auth, webauthnEnabled } = args;
  return router({
      registerOptions: protectedProcedure.mutation(async ({ ctx }) => {
        if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
        try {
          return await auth.startWebauthnRegistration(ctx.principal.userId);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

      registerVerify: protectedProcedure
        .input(
          z.object({
            id: z.string().min(1),
            rawId: z.string().min(1),
            type: z.literal('public-key'),
            response: z.object({
              clientDataJSON: z.string().min(1),
              attestationObject: z.string().min(1),
              transports: z.array(z.string()).optional(),
            }),
            clientExtensionResults: z.record(z.unknown()).optional(),
          }),
        )
        .output(z.object({ credentialId: z.string() }))
        .mutation(async ({ ctx, input }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            return await auth.confirmWebauthnRegistration(ctx.principal.userId, input);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      authOptions: publicProcedure.input(z.object({ identifier: z.string().min(1) })).mutation(async ({ input }) => {
        if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
        try {
          return await auth.startWebauthnAuthentication(input.identifier);
        } catch (err) {
          throw toTrpcError(err);
        }
      }),

      authVerify: publicProcedure
        .input(
          z.object({
            identifier: z.string().min(1),
            credential: z.object({
              id: z.string().min(1),
              rawId: z.string().min(1),
              type: z.literal('public-key'),
              response: z.object({
                clientDataJSON: z.string().min(1),
                authenticatorData: z.string().min(1),
                signature: z.string().min(1),
                userHandle: z.string().nullish(),
              }),
              clientExtensionResults: z.record(z.unknown()).optional(),
            }),
          }),
        )
        .output(sessionOutput)
        .mutation(async ({ input }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            const session = await auth.confirmWebauthnAuthentication(input.identifier, input.credential);
            return { ...session, expiresAt: session.expiresAt.toISOString() };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      list: protectedProcedure
        .output(
          z.array(
            z.object({
              credentialId: z.string(),
              createdAt: z.string(),
              transports: z.array(z.string()).optional(),
            }),
          ),
        )
        .query(async ({ ctx }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            return await auth.listWebauthnCredentials(ctx.principal.userId);
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

      /**
       * Retire one enrolled authenticator. Self-only via principal.
       * Missing/foreign id → removed:false (never confirms existence).
       */
      remove: protectedProcedure
        .input(z.object({ credentialId: z.string().min(1) }))
        .output(z.object({ removed: z.boolean() }))
        .mutation(async ({ ctx, input }) => {
          if (!webauthnEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'WebAuthn is disabled' });
          try {
            const removed = await auth.removeWebauthnCredential(ctx.principal.userId, input.credentialId);
            return { removed };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),
  });
}
