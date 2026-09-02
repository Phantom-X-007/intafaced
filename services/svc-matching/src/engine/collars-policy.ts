/**
 * Alias of collars.ts. Do not dual-wrap MatchingEngine.
 * CARD D-collars mill lives in collars.ts — unpublished is not a zero band.
 */
export {
  COLLAR_UNPUBLISHED,
  FAT_FINGER_UNPUBLISHED,
  THROTTLE_UNPUBLISHED,
  SEVERE_MARKET_UNSET,
  collarMagnitudesUnset,
  fatFingerMagnitudesUnset,
  throttleMagnitudesUnset,
  applyCollar,
  collarBand,
  applyFatFinger,
  throttleCheck,
  enterSevereMarket,
  installCollars,
} from './collars.js';
