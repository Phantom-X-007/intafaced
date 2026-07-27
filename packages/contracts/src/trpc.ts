import { initTRPC, TRPCError } from '@trpc/server';
import type { Principal, Scope } from '@intafaced/auth';
import { requireScope, requireTier, AuthError } from '@intafaced/auth';
import type { KycTier, ModuleId, Plane } from '@intafaced/config';
import { checkAccess } from '@intafaced/config';

/**
 * The tRPC foundation every internal router builds on.
 *
 * §2: cross-service calls go through packages/contracts. A service exports its
 * router type from here; callers import the TYPE only and get end-to-end
 * inference without importing the implementation — or, critically, its tables.
 */

export interface Context {
  /** Null for anonymous calls. */
  principal: Principal | null;
  /** Resolved at the edge from IP / account region. Drives the matrix. */
  region: string;
  /** W3C traceparent so a call keeps its trace across services (§9). */
  traceparent?: string;
  requestId: string;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Surface our own error codes so clients can branch on
        // 'ledger.insufficient_funds' rather than parsing prose.
        intafacedCode: error.cause instanceof AuthError ? error.cause.code : undefined,
      },
    };
  },
});

export const router = t.router;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

/** Open to anyone. Use sparingly — most things need a principal. */
export const publicProcedure = t.procedure;

const authed = middleware(({ ctx, next }) => {
  if (!ctx.principal) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});

/** Requires a verified principal. */
export const protectedProcedure = t.procedure.use(authed);

export interface GuardOptions {
  /** Minimum verification tier. */
  tier?: KycTier;
  /** Gate on the JURISDICTION_MATRIX for this module (§9). */
  module?: ModuleId;
  /** Which plane the call runs on. Drives the §22 sovereignty branch. */
  plane?: Plane;
}

/**
 * The one authorisation guard. Scope, tier, and jurisdiction are checked in a
 * single middleware so a procedure declares everything it requires in one
 * place — and so nothing can accidentally skip the matrix.
 *
 * Throws FORBIDDEN, or UNAUTHORIZED when the real problem is a missing second
 * factor: the client needs to tell "you may not" apart from "prove it again".
 */
export function scopedProcedure(scope: Scope, guards: GuardOptions = {}) {
  return protectedProcedure.use(({ ctx, next }) => {
    try {
      requireScope(ctx.principal, scope);
      if (guards.tier) requireTier(ctx.principal, guards.tier);
    } catch (err) {
      if (err instanceof AuthError && err.code === 'mfa.required') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: err.message, cause: err });
      }
      throw new TRPCError({ code: 'FORBIDDEN', message: (err as Error).message, cause: err });
    }

    if (guards.module) {
      const decision = checkAccess({
        module: guards.module,
        plane: guards.plane ?? 'fiat',
        region: ctx.region,
        kycTier: ctx.principal.tier,
      });
      if (!decision.allowed) {
        throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
      }
    }

    return next({ ctx });
  });
}

/**
 * Jurisdiction gate for procedures with no principal — public checkout pages,
 * hosted Lane A surfaces, marketing endpoints. Authenticated procedures use
 * `scopedProcedure(scope, { module })` instead.
 */
export function publicJurisdictionProcedure(module: ModuleId, plane: Plane = 'fiat') {
  return t.procedure.use(({ ctx, next }) => {
    const decision = checkAccess({ module, plane, region: ctx.region, kycTier: ctx.principal?.tier ?? 'none' });
    if (!decision.allowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: decision.reason });
    }
    return next({ ctx });
  });
}

export { TRPCError };
