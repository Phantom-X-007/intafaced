import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, scopedProcedure, serviceProcedure, TRPCError } from '@intafaced/contracts';
import { rankPerksSchema, rankStateSchema } from '@intafaced/contracts';
import { AuthError as GuardError, requireMfa } from '@intafaced/auth';
import { AuthError, assertOperatorKycReview, type AuthService, type KycRecordView } from './auth/auth-service.js';
import type { RankService } from './rank/rank-service.js';
import type { LedgerClient } from '@intafaced/ledger-client';
import {
  AFFILIATE_PAYOUT_RESIDUAL,
  AffiliatePayoutRefuseError,
  affiliateFreezeHonestyLine,
  affiliateMemberListStatusLine,
  affiliateTreeStatusLine,
} from './affiliates/admin-tree-read.js';
import {
  affiliatePayoutPlanStatusLine,
  assertPayoutRateProvenance,
  planAffiliatePayout,
  postAffiliatePayout,
} from './affiliates/payout-engine.js';
import { ReferralError } from './affiliates/referral-tree.js';
import type { ReferralService } from './affiliates/referral-service.js';
import { FreezeError } from './affiliates/freeze-store.js';
import type { FreezeService } from './affiliates/freeze-service.js';
import { CommissionError } from './affiliates/commission.js';
import {
  AccrualRateRefuseError,
  accrualTierLawIsPublished,
  type AccrualTierLaw,
  UNPUBLISHED_ACCRUAL_TIER_LAW,
} from './affiliates/commission-rate-law.js';
import { accrueTreeUnderRateAuthority, accrualTreeAuthorityStatusLine } from './affiliates/accrual-tree-authority.js';
import type { AccrualStore } from './affiliates/accrual-store.js';
import { KYC_VAULT_UNWIRED } from './kyc/boot-vault.js';
import { KycDocumentError, type KycDocumentVault, type StoredDocumentMeta } from './kyc/document-store.js';
import { ProviderRefBindError, type BindProviderRefInput, type BindProviderRefResult } from './kyc/provider-ref-bind.js';
import { FlagDisabledError } from '@intafaced/config';
import { WaitlistError, type WaitlistService } from './waitlist/waitlist-service.js';
import { userCopy } from './user-copy.js';

/**
 * svc-identity's API (§4.1).
 *
 * The contract shape lives in `packages/contracts` — this implements it. A
 * breaking change there is a compile error here, caught in the contracts PR
 * before any consumer is touched (§15.2).
 */

function toTrpcError(err: unknown): TRPCError {
  // Already shaped for the wire — do not re-wrap.
  if (err instanceof TRPCError) return err;

  // A guard rejection (`requireMfa`) is not a server fault. It arrives as the
  // shared package's AuthError, which is a different class from this service's.
  if (err instanceof GuardError) {
    return new TRPCError({ code: err.code === 'mfa.required' ? 'UNAUTHORIZED' : 'FORBIDDEN', message: err.message, cause: err });
  }

  if (err instanceof KycDocumentError) {
    switch (err.code) {
      case 'kyc_doc.not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'kyc_doc.key_missing':
        return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
      case 'kyc_doc.forbidden':
      case 'kyc_doc.reader_missing':
        return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
      case 'kyc_doc.too_large':
      case 'kyc_doc.bad_content_type':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
      case 'kyc_doc.decrypt_failed':
        return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message, cause: err });
    }
  }

  if (err instanceof ProviderRefBindError) {
    switch (err.code) {
      case 'kyc_bind.record_not_found':
      case 'kyc_bind.doc_mismatch':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'kyc_bind.record_not_pending':
      case 'kyc_bind.already_set':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'kyc_bind.invalid':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }
