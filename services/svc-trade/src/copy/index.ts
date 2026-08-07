/**
 * Copy module public surface (D-S-03 / SPEC-SOVEREIGN-ROUTING-AND-COPY Stage).
 * Class M — fee-share moves value via ledger-client only when §8 rates publish.
 */

export { CopyService, type CopyServiceOptions } from './copy-service.js';
export { CopyError, COPY_FEE_SHARE_RESIDUAL, COPY_JURISDICTION_RESIDUAL, COPY_LAW_RESIDUAL, type CopyErrorCode } from './errors.js';
export {
  parseCopyFeeShareLawJson,
  parseCopyJurisdictionLawJson,
  requirePublishedCopyFeeShareLaw,
  requirePublishedCopyJurisdictionLaw,
  copyLawStatusLine,
  copyLawResidual,
  UNPUBLISHED_COPY_FEE_SHARE_LAW,
  UNPUBLISHED_COPY_JURISDICTION_LAW,
  type CopyFeeShareLaw,
  type CopyJurisdictionLaw,
} from './fee-share-law.js';
export {
  attributeCopyFeeShare,
  planCopyFeeShareSettle,
  postCopyFeeShareSettle,
  refusePnlLinkedCopyFee,
  presentFeeShareAttribution,
} from './fee-share.js';
export {
  parseCopyEnvelope,
  assertCopyRegionAllowed,
  presentCopyFollow,
  type CopyEnvelope,
  type CopyFollow,
  type PresentCopyFollow,
} from './follows.js';
export {
  planMirror,
  parseLeaderFillObservation,
  presentMirrorPlan,
  refuseCopyLeaderRanking,
  type MirrorPlan,
  type LeaderFillObservation,
  type MirrorSide,
} from './mirror.js';
