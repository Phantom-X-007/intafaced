/**
 * pay.routing public barrel — smart geo/method/risk selection + input gates.
 */

export {
  APPROVAL_RATE_UNSET_SKIP,
  assertNoInventedRoutingScores,
  assertRoutingInputsPresent,
  assertRoutingScoresRefuseBlank,
  FORBIDDEN_ROUTING_SCORE_FIELDS,
  missingRoutingDimensions,
  readOperatorDeclaredSuccessRate,
  RoutingInputError,
  SUCCESS_RATE_SCALE,
  type ApprovalRateUnsetSkip,
  type OperatorDeclaredSuccessRate,
  type RoutingDimension,
  type RoutingInputErrorCode,
  type RoutingInputPolicy,
  type RoutingInputs,
  type RoutingScoreKey,
} from '../routing-inputs.js';

export {
  REFERENCE_RAIL_ROUTING_PROFILES,
  selectSmartCheckoutRail,
  SmartRoutingApprovalRateUnsetError,
  SmartRoutingNoRailError,
  toRoutingDecisionRecord,
  type PresentRoutingInputs,
  type RailRoutingProfile,
  type SmartRailDecisionEntry,
  type SmartRoutingDecision,
  type SmartRoutingErrorCode,
  type SmartRoutingRequest,
  type SmartRoutingSkipReason,
} from './decide.js';
