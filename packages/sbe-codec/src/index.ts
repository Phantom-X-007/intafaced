/**
 * @intafaced/sbe-codec — EXT Real Logic SBE 1.39.0, adapter-only.
 *
 * Does not move value. Does not own balances. Does not replace NATS.
 * Qty/price leave as decimal strings. Missing generator refuses sbe_unavailable.
 */
export { createSbeCodec, sbeCodec } from './codec.js';
export { MONEY_FIELDS, readDecimalString } from './decimal.js';
export { JAVA_ENV, javaMainClassPath, loadJavaSbeCodec } from './java-bridge.js';
export { SBE_PIN_PATH, readSbePin, type SbePin } from './pin.js';
export { SBE_UNAVAILABLE } from './types.js';
export type {
  AdapterRefuse,
  AdapterRefuseReason,
  DecodeDepthLevel,
  DecodeOk,
  DecodeResult,
  DecodeTrade,
  DecimalString,
  DepthLevelInput,
  EncodeInput,
  EncodeOk,
  EncodeResult,
  JavaSbeCodec,
  SbeCodec,
  Side,
  TemplateName,
  TradeInput,
} from './types.js';
