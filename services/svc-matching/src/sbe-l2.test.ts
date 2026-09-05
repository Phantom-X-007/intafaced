import { describe, expect, it } from 'vitest';
import { createSbeCodec, loadJavaSbeCodec, SBE_UNAVAILABLE, type JavaSbeCodec, type SbeCodec } from '@intafaced/sbe-codec';
import {
  encodeMatchingL2Sbe,
  isRealLogicDepthFrame,
  MATCHING_SBE_UNAVAILABLE,
  readSbeHeader,
  SBE_DEPTH_TEMPLATE_ID,
  SBE_SCHEMA_ID,
  wantsMatchingSbe,
} from './sbe-l2.js';

/**
 * Leftover mill: SBE on matching is Real Logic octets, not a utf8 JSON stub.
 * Linked utf8 marker is still not SBE.
 */

const BOOK = {
  marketId: 'BTC-USDT',
  sequence: 10,
  bids: [['100', '1']] as const,
  asks: [['101', '1']] as const,
};

function stubUtf8Java(): JavaSbeCodec {
  return {
    handle(json: string): string {
      const req = JSON.parse(json) as Record<string, unknown>;
      const marker = [
        String(req.template),
        String(req.instrument),
        String(req.side),
        String(req.price),
        String(req.qty),
        String(req.sequence),
      ].join(':');
      return JSON.stringify({ ok: true, template: req.template, payloadB64: Buffer.from(marker, 'utf8').toString('base64') });
    },
  };
}

function unlinkedCodec(): SbeCodec {
  return createSbeCodec({ java: null });
}

describe('matching L2 SBE — schema id, not utf8 stub', () => {
  it('unlinked codec refuses sbe_unavailable rather than emitting JSON', () => {
    const encoded = encodeMatchingL2Sbe(unlinkedCodec(), BOOK);
    expect(encoded.ok).toBe(false);
    if (encoded.ok) return;
    expect(encoded.reason).toBe(SBE_UNAVAILABLE);
    expect(encoded.linked).toBe(false);
    expect(JSON.stringify(encoded)).not.toMatch(/"bids"/);
    expect(MATCHING_SBE_UNAVAILABLE).toBe('matching.sbe_unavailable');
  });

  it('utf8 stub payload is not schemaId 101 — matching refuses it as SBE', () => {
    const encoded = encodeMatchingL2Sbe(createSbeCodec({ java: stubUtf8Java() }), BOOK);
    expect(encoded.ok).toBe(false);
    if (encoded.ok) return;
    expect(encoded.reason).toBe(SBE_UNAVAILABLE);
    expect(encoded.message).toMatch(/utf8 stub/i);
  });

  it('ieee money refuses — never JSON-number SBE', () => {
    const encoded = encodeMatchingL2Sbe(createSbeCodec({ java: stubUtf8Java() }), {
      ...BOOK,
      bids: [[0.1 as unknown as string, '1']],
    });
    expect(encoded.ok).toBe(false);
    if (encoded.ok) return;
    expect(encoded.reason).toBe('ieee_input');
  });

  it('format=sbe is the SBE ask; other formats are not', () => {
    expect(wantsMatchingSbe({ format: 'sbe' })).toBe(true);
    expect(wantsMatchingSbe({ format: 'l3' })).toBe(false);
    expect(wantsMatchingSbe({})).toBe(false);
  });

  it('linked Real Logic codec emits DepthLevel schemaId 101 / templateId 2 octets', ({ skip }) => {
    const java = loadJavaSbeCodec();
    if (java === null) {
      skip('Java SBE not linked (INTAFACED_SBE_JAVA jar / toolchain missing). Honest skip — utf8 stub is not this test.');
      return;
    }
    const encoded = encodeMatchingL2Sbe(createSbeCodec({ java }), BOOK);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.book).toBe('L2');
    expect(encoded.template).toBe('DepthLevel');
    expect(encoded.payloads.length).toBe(2);
    for (const payload of encoded.payloads) {
      expect(isRealLogicDepthFrame(payload)).toBe(true);
      const header = readSbeHeader(payload);
      expect(header?.schemaId).toBe(SBE_SCHEMA_ID);
      expect(header?.templateId).toBe(SBE_DEPTH_TEMPLATE_ID);
      expect(Buffer.from(payload).toString('utf8').startsWith('DepthLevel:')).toBe(false);
    }
    expect(JSON.stringify(encoded)).not.toMatch(/L3/i);
  }, 180_000);
});
