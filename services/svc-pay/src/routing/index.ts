/**
 * pay.routing public barrel — smart geo/method/risk selection + input gates.
 */

export {
  assertNoInventedRoutingScores,
  assertRoutingInputsPresent,
  FORBIDDEN_ROUTING_SCORE_FIELDS,
  missingRoutingDimensions,
  RoutingInputError,
  type RoutingDimension,
  type RoutingInputErrorCode,
  type RoutingInputPolicy,
  type RoutingInputs,
} from '../routing-inputs.js';

export {
  REFERENCE_RAIL_ROUTING_PROFILES,
  selectSmartCheckoutRail,
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
