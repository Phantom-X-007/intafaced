import { z } from 'zod';
import { router, publicProcedure, TRPCError } from '@intafaced/contracts';
import type { AuthService } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';
import type { LedgerClient } from '@intafaced/ledger-client';
import type { ReferralService } from './affiliates/referral-service.js';
import type { FreezeService } from './affiliates/freeze-service.js';
import { type AccrualTierLaw, UNPUBLISHED_ACCRUAL_TIER_LAW } from './affiliates/commission-rate-law.js';
import type { AccrualStore } from './affiliates/accrual-store.js';
import { KYC_VAULT_UNWIRED } from './kyc/boot-vault.js';
import type { KycDocumentVault } from './kyc/document-store.js';
import type { BindProviderRefInput, BindProviderRefResult } from './kyc/provider-ref-bind.js';
import type { WaitlistService } from './waitlist/waitlist-service.js';
import { createAuthRouter, createTotpRouter, createWebauthnRouter } from './router-auth.js';
import { createKycRouter } from './router-kyc.js';
import { createRankRouter, createApiKeysRouter, createComplianceRouter, createSubAccountsRouter } from './router-rest.js';
import { createAffiliatesRouter } from './router-affiliates.js';
import { createWaitlistRouter } from './router-waitlist.js';

export { toTrpcError, presentKyc, presentDocMeta } from './router-shared.js';

export function createIdentityRouter(
  auth: AuthService,
  rank: RankService,
  options: {
    registrationOpen: boolean;
    webauthnEnabled?: boolean;
    referral?: ReferralService;
    freeze?: FreezeService;
    accruals?: AccrualStore;
    accrualTierLaw?: AccrualTierLaw;
    ledger?: Pick<LedgerClient, 'post'>;
    kycDocs?: KycDocumentVault;
    bindKycProviderRef?: (input: BindProviderRefInput) => Promise<BindProviderRefResult>;
    waitlist?: WaitlistService;
  },
) {
  const webauthnEnabled = options.webauthnEnabled !== false;
  const referral = options.referral;
  const freeze = options.freeze;
  const accruals = options.accruals;
  const accrualTierLaw = options.accrualTierLaw ?? UNPUBLISHED_ACCRUAL_TIER_LAW;
  const ledger = options.ledger;
  const kycDocs = options.kycDocs;
  const bindKycProviderRef = options.bindKycProviderRef;
  const waitlist = options.waitlist;

  function requireReferral(): ReferralService {
    if (!referral) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Referral tree is not configured' });
    }
    return referral;
  }

  function requireFreeze(): FreezeService {
    if (!freeze) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Affiliate freeze store is not configured' });
    }
    return freeze;
  }

  function requireAccruals(): AccrualStore {
    if (!accruals) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Affiliate accrual store is not configured' });
    }
    return accruals;
  }

  function requireKycDocs(): KycDocumentVault {
    if (!kycDocs) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `KYC document vault is not configured [${KYC_VAULT_UNWIRED}]`,
      });
    }
    return kycDocs;
  }

  function requireBindKyc(): (input: BindProviderRefInput) => Promise<BindProviderRefResult> {
    if (!bindKycProviderRef) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'KYC provider_ref bind is not configured',
      });
    }
    return bindKycProviderRef;
  }

  function requireWaitlist(): WaitlistService {
    if (!waitlist) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Waitlist capture is not wired [waitlist.unbuilt]',
      });
    }
    return waitlist;
  }

  return router({
    health: publicProcedure
      .output(z.object({ ok: z.boolean(), service: z.literal('svc-identity') }))
      .query(() => ({ ok: true, service: 'svc-identity' as const })),

    auth: createAuthRouter({ auth, registrationOpen: options.registrationOpen, webauthnEnabled, requireReferral }),
    totp: createTotpRouter({ auth }),
    webauthn: createWebauthnRouter({ auth, webauthnEnabled }),
    kyc: createKycRouter({ auth, requireKycDocs, requireBindKyc }),
    rank: createRankRouter({ rank }),
    apiKeys: createApiKeysRouter({ auth }),
    compliance: createComplianceRouter({ auth }),
    subAccounts: createSubAccountsRouter({ auth }),
    affiliates: createAffiliatesRouter({
      requireReferral,
      requireFreeze,
      requireAccruals,
      freeze,
      accrualTierLaw,
      ledger,
    }),
    waitlist: createWaitlistRouter({ requireWaitlist }),
  });
}

export type IdentityRouter = ReturnType<typeof createIdentityRouter>;
