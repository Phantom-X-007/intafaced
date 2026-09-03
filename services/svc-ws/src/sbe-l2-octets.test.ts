import { describe, expect, it } from 'vitest';
import { createSbeCodec, loadJavaSbeCodec, type JavaSbeCodec } from '@intafaced/sbe-codec';
import { encodeL2Snapshot } from './sbe-l2-tape.js';

/**
 * H3 — public L2 SBE octets are Real Logic schema-id'd frames, not a utf8 marker.
 * Never L3. Skip only when Java SBE cannot run — listed, not green-via-stub.
 */

const SCHEMA_ID = 101;
const DEPTH_TEMPLATE_ID = 2;
const UTF8_STUB_PREFIX = 'DepthLevel:';

const BOOK = {
  marketId: 'BTC-USDT',
  sequence: 10,
  bids: [['100', '1']] as const,
  asks: [['101', '1']] as const,
};

function readHeader(payload: Uint8Array): {
  readonly blockLength: number;
  readonly templateId: number;
  readonly schemaId: number;
  readonly version: number;
} {
  const view = Buffer.from(payload);
  return {
    blockLength: view.readUInt16LE(0),
    templateId: view.readUInt16LE(2),
    schemaId: view.readUInt16LE(4),
    version: view.readUInt16LE(6),
  };
}

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

describe('H3 L2 SBE octets — schema id, not utf8 stub', () => {
  it('utf8 stub payload is not schemaId 101 — that marker is not SBE', () => {
    const encoded = encodeL2Snapshot(createSbeCodec({ java: stubUtf8Java() }), BOOK);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const first = encoded.payloads[0]!;
    expect(Buffer.from(first).toString('utf8').startsWith(UTF8_STUB_PREFIX)).toBe(true);
    expect(readHeader(first).schemaId).not.toBe(SCHEMA_ID);
    expect(JSON.stringify(encoded)).not.toMatch(/L3/i);
  });

  it('linked Real Logic codec emits DepthLevel schemaId 101 / templateId 2 octets', ({ skip }) => {
    const java = loadJavaSbeCodec();
    if (java === null) {
      skip('Java SBE not linked (INTAFACED_SBE_JAVA jar / toolchain missing). Honest skip — utf8 stub is not this test.');
      return;
    }
    const encoded = encodeL2Snapshot(createSbeCodec({ java }), BOOK);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.book).toBe('L2');
    expect(encoded.template).toBe('DepthLevel');
    expect(encoded.payloads.length).toBe(2);
    for (const payload of encoded.payloads) {
      expect(payload.byteLength).toBeGreaterThanOrEqual(8);
      const text = Buffer.from(payload).toString('utf8');
      expect(text.startsWith(UTF8_STUB_PREFIX)).toBe(false);
      expect(text).not.toContain('protobuf');
      const header = readHeader(payload);
      expect(header.schemaId).toBe(SCHEMA_ID);
      expect(header.templateId).toBe(DEPTH_TEMPLATE_ID);
      expect(header.version).toBe(0);
    }
    expect(JSON.stringify(encoded)).not.toMatch(/L3/i);
  }, 180_000);
});
