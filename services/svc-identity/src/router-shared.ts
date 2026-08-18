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

export function toTrpcError(err: unknown): TRPCError {
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

  if (err instanceof ReferralError) {
    switch (err.code) {
      case 'referral.unknown_referrer':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'referral.already_set':
      case 'referral.cycle':
      case 'referral.depth':
      case 'referral.self':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'referral.invalid':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }

  if (err instanceof FreezeError) {
    switch (err.code) {
      case 'freeze.not_found':
        return new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      case 'freeze.already':
      case 'freeze.not_frozen':
        return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
      case 'freeze.invalid':
        return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
    }
  }

  if (err instanceof CommissionError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message, cause: err });
  }

  if (err instanceof AccrualRateRefuseError) {
    // PRECONDITION_FAILED: operator asked to accrue before owner rates exist.
    // Same residual class as payout refuse — invent hole was accrual, not only payout.
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.message} [${err.residual}]`,
      cause: err,
    });
  }

  if (err instanceof AffiliatePayoutRefuseError) {
    // PRECONDITION_FAILED: operator asked for pay before owner rates + ledger recipe exist.
    return new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `${err.message} [${err.residual}]`,
      cause: err,
    });
  }

  if (err instanceof FlagDisabledError) {
    // Drop clock / override / env pin — named code on the message so the
    // client can tell disabled from drop_pending without a second field.
    return new TRPCError({ code: 'PRECONDITION_FAILED', message: `${err.message} [${err.code}]`, cause: err });
  }

  if (err instanceof WaitlistError) {
    switch (err.code) {
      case 'waitlist.unbuilt':
        return new TRPCError({ code: 'PRECONDITION_FAILED', message: `${err.message} [${err.code}]`, cause: err });
      case 'waitlist.not_found':
      case 'waitlist.unknown_referrer':
        return new TRPCError({ code: 'NOT_FOUND', message: `${err.message} [${err.code}]`, cause: err });
      case 'waitlist.self_referral':
        return new TRPCError({ code: 'CONFLICT', message: `${err.message} [${err.code}]`, cause: err });
      case 'waitlist.invalid':
        return new TRPCError({ code: 'BAD_REQUEST', message: `${err.message} [${err.code}]`, cause: err });
    }
  }

  if (!(err instanceof AuthError)) {
    return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: userCopy('error.generic'), cause: err });
  }

  const message = userCopy(err.code);

  switch (err.code) {
    case 'auth.invalid_credentials':
    case 'auth.mfa_invalid':
    case 'auth.domain_not_allowed':
      // Deliberately the same shape as a wrong password: never confirm which
      // half of the credential was right (including "key ok, origin wrong").
      return new TRPCError({ code: 'UNAUTHORIZED', message, cause: err });
    case 'auth.mfa_required':
      return new TRPCError({ code: 'UNAUTHORIZED', message, cause: err });
    case 'auth.mfa_not_enrolled':
    case 'auth.webauthn_not_enrolled':
      // FORBIDDEN, not UNAUTHORIZED: retrying with a code cannot help. The
      // client has to send the user through enrolment first, and the two
      // need different UI.
      return new TRPCError({ code: 'FORBIDDEN', message, cause: err });
    case 'auth.webauthn_invalid':
      return new TRPCError({ code: 'UNAUTHORIZED', message, cause: err });
    case 'auth.kyc_not_pending':
      return new TRPCError({ code: 'CONFLICT', message: err.message, cause: err });
    case 'auth.kyc_agent_refused':
      // Operator/agent refuse — keep the reviewed_by sentence. Not user catalog copy.
      return new TRPCError({ code: 'FORBIDDEN', message: err.message, cause: err });
    case 'auth.session_invalid':
    case 'auth.session_reused':
      return new TRPCError({ code: 'UNAUTHORIZED', message, cause: err });
    case 'auth.handle_taken':
    case 'auth.email_taken':
    case 'auth.mfa_already_enrolled':
      return new TRPCError({ code: 'CONFLICT', message, cause: err });
    case 'auth.account_frozen':
      return new TRPCError({ code: 'FORBIDDEN', message, cause: err });
    case 'auth.not_found':
      return new TRPCError({ code: 'NOT_FOUND', message, cause: err });
    case 'auth.sub_account_required':
    case 'auth.sub_account_same':
      return new TRPCError({ code: 'BAD_REQUEST', message, cause: err });
    case 'auth.sub_account_denied':
    case 'auth.sub_account_revoked':
    case 'auth.sub_account_limit':
      return new TRPCError({ code: 'FORBIDDEN', message, cause: err });
    case 'auth.totp_key_missing':
      // Server misconfiguration — enrol cannot write plaintext. Ops must set IDENTITY_TOTP_SECRET_KEY.
      return new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message, cause: err });
  }
}

export const sessionOutput = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  userId: z.string().uuid(),
});

/** The tiers a user can ask for. `none` is the absence of a record, not a request. */
export const submittableTier = z.enum(['basic', 'full', 'institutional']);

export const kycRecordOutput = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tier: z.enum(['none', 'basic', 'full', 'institutional']),
  jurisdiction: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  reviewedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

/**
 * What a KYC record looks like on the wire.
 *
 * `providerRef` and `reviewedBy` are deliberately absent. §10 PII isolation:
 * the provider pointer is an internal reference to a document store, and naming
 * the reviewing operator to the user under review is how a compliance officer
 * acquires a personal adversary. Both stay server-side.
 */
export function presentKyc(record: KycRecordView) {
  return {
    id: record.id,
    userId: record.userId,
    tier: record.tier,
    jurisdiction: record.jurisdiction,
    status: record.status,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Meta only on the wire — never bytes, never ciphertext. */
export function presentDocMeta(meta: StoredDocumentMeta) {
  return {
    id: meta.id,
    userId: meta.userId,
    contentType: meta.contentType,
    byteLength: meta.byteLength,
    storedBy: meta.storedBy,
    createdAt: meta.createdAt.toISOString(),
  };
}

export const kycDocMetaOutput = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  contentType: z.string(),
  byteLength: z.number().int().positive(),
  storedBy: z.string().nullable(),
  createdAt: z.string(),
});
