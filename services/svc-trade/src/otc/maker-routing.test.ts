import { describe, expect, it } from 'vitest';
import { OTC_MAKER_ROUTING_SOCKET, parseOtcMakerRoutingJson } from './maker-routing.js';

describe('parseOtcMakerRoutingJson', () => {
  it('fails first when TRADE_OTC_MAKER_ROUTING is blank', () => {
    expect(() => parseOtcMakerRoutingJson('')).toThrow(new RegExp(OTC_MAKER_ROUTING_SOCKET));
    expect(() => parseOtcMakerRoutingJson('  ')).toThrow(/TRADE_OTC_MAKER_ROUTING is blank/);
    expect(() => parseOtcMakerRoutingJson(undefined)).toThrow(/refuses/);
  });

  it('accepts an explicit platform route', () => {
    expect(parseOtcMakerRoutingJson('{"published":true,"counterparty":"platform"}')).toEqual({
      published: true,
      counterparty: 'platform',
    });
  });

  it('accepts an explicit maker route without inventing its ledger path', () => {
    expect(parseOtcMakerRoutingJson('{"published":true,"counterparty":"maker"}')).toEqual({
      published: true,
      counterparty: 'maker',
    });
  });

  it('rejects invalid or ambiguous recipes', () => {
    expect(() => parseOtcMakerRoutingJson('not-json')).toThrow(/valid JSON/);
    expect(() => parseOtcMakerRoutingJson('{"published":false,"counterparty":"platform"}')).toThrow(/published/);
    expect(() => parseOtcMakerRoutingJson('{"published":true,"counterparty":"platform","makerId":"m1"}')).toThrow(/ambiguous/);
    expect(() => parseOtcMakerRoutingJson('{"published":true,"counterparty":"venue"}')).toThrow(/platform\|maker/);
  });
});
