/**
 * Public wire types for the Real Logic SBE 1.39.0 adapter.
 *
 * Qty/price cross this boundary as decimal strings only. This package is not a
 * book, not a bus, and not live market-data SoT.
 */

export type DecimalString = string;

export const SBE_UNAVAILABLE = 'sbe_unavailable' as const;

export type Side = 'buy' | 'sell';
export type TemplateName = 'Trade' | 'DepthLevel';

export type TradeInput = {
  readonly template: 'Trade';
  readonly instrument: string;
  readonly tradeId: string;
  readonly side: Side;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly eventTimeNs: string;
};

export type DepthLevelInput = {
  readonly template: 'DepthLevel';
  readonly instrument: string;
  readonly sequence: string;
  readonly side: Side;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly eventTimeNs: string;
};

export type EncodeInput = TradeInput | DepthLevelInput;

export type EncodeOk = {
  readonly ok: true;
  readonly linked: true;
  readonly template: TemplateName;
  readonly payload: Uint8Array;
  readonly payloadB64: string;
};

export type DecodeTrade = {
  readonly ok: true;
  readonly linked: true;
  readonly template: 'Trade';
  readonly instrument: string;
  readonly tradeId: string;
  readonly side: Side;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly eventTimeNs: string;
};

export type DecodeDepthLevel = {
  readonly ok: true;
  readonly linked: true;
  readonly template: 'DepthLevel';
  readonly instrument: string;
  readonly sequence: string;
  readonly side: Side;
  readonly price: DecimalString;
  readonly qty: DecimalString;
  readonly eventTimeNs: string;
};

export type DecodeOk = DecodeTrade | DecodeDepthLevel;

export type AdapterRefuseReason =
  | typeof SBE_UNAVAILABLE
  | 'missing_input'
  | 'ieee_input'
  | 'invalid_decimal'
  | 'invalid_message'
  | 'unsupported_template'
  | 'schema_mismatch';

export type AdapterRefuse = {
  readonly ok: false;
  readonly linked: boolean;
  readonly reason: AdapterRefuseReason;
  readonly field?: string;
  readonly message: string;
};

export type EncodeResult = EncodeOk | AdapterRefuse;
export type DecodeResult = DecodeOk | AdapterRefuse;

export type JavaSbeCodec = {
  readonly handle: (json: string) => string;
};

export type SbeCodec = {
  readonly linked: boolean;
  encode(input: Partial<EncodeInput> | null | undefined): EncodeResult;
  decode(payload: Uint8Array | string | null | undefined): DecodeResult;
};
