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
