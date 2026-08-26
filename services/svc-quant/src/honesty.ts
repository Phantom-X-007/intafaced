import {
  assessSimulatedNotLive,
  type SimulatedPerformanceEnvironment,
  type SimulatedPerformanceStamp,
} from '@intafaced/quant-honesty';
import {
  QUANT_ENVIRONMENT_REQUIRED,
  QUANT_ENVIRONMENT_UNKNOWN,
  QUANT_SIMULATED_AS_LIVE,
  QuantError,
} from './errors.js';

const CODE = {
  missing_environment: QUANT_ENVIRONMENT_REQUIRED,
  unknown_environment: QUANT_ENVIRONMENT_UNKNOWN,
  live_environment_refused: QUANT_SIMULATED_AS_LIVE,
  simulated_as_live: QUANT_SIMULATED_AS_LIVE,
} as const;

/** Paper / backtest / shadow stamp, or a named refuse. Never defaults to live. */
export function requireSimulatedStamp(
  environment: string | null | undefined,
  presentedAs?: string | null,
  allowed?: readonly SimulatedPerformanceEnvironment[],
): SimulatedPerformanceStamp {
  const assessment = assessSimulatedNotLive({ environment, presentedAs, allowed });
  if (!assessment.ok) {
    throw new QuantError(CODE[assessment.refusal.code], assessment.refusal.detail);
  }
  return assessment.stamp;
}
