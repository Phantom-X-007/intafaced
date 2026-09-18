import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSbeCodec, type JavaSbeCodec } from '@intafaced/sbe-codec';
import { encodeL2Snapshot } from './sbe-l2-tape.js';

/**
 * H3 — public L2 SBE octets are Real Logic schema-id'd frames, not a utf8 marker.
 * Never L3. Skip only when Java SBE cannot run — listed, not green-via-stub.
 */

const SCHEMA_ID = 101;
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

  it('linked Real Logic codec emits DepthLevel schemaId 101 / templateId 2 octets', async ({ skip }) => {
    const here = dirname(fileURLToPath(import.meta.url));
    const script = join(here, '../scripts/sbe-l2-linked-octets.ts');
    const tsx = [join(here, '../../../node_modules/tsx/dist/cli.mjs'), join(here, '../../node_modules/tsx/dist/cli.mjs')].find((p) =>
      existsSync(p),
    );
    expect(tsx).toBeDefined();
    const r = await new Promise<{ status: number | null; out: string }>((resolve) => {
      const child = spawn(process.execPath, [tsx!, script], { cwd: join(here, '..') });
      let out = '';
      child.stdout.on('data', (d: Buffer) => {
        out += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        out += d.toString();
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
      child.on('close', (status) => {
        clearTimeout(timer);
        resolve({ status, out });
      });
    });
    if (r.out.includes('sbe_unavailable')) {
      skip('Java SBE not linked (INTAFACED_SBE_JAVA jar / toolchain missing). Honest skip — utf8 stub is not this test.');
      return;
    }
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/schemaId=101/);
    expect(r.out).toMatch(/templateId=2/);
    expect(r.out).not.toMatch(/L3/i);
  }, 180_000);
});
