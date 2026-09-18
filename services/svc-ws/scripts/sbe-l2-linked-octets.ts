/**
 * Linked L2 DepthLevel octets OUTSIDE the vitest worker.
 * spawnSync Java inside vitest blocks birpc (same as sbe-codec linked-roundtrip).
 * Unlinked: print sbe_unavailable and exit 0 — utf8 stub is not this proof.
 */
import { createSbeCodec, loadJavaSbeCodec } from '@intafaced/sbe-codec';
import { encodeL2Snapshot } from '../src/sbe-l2-tape.ts';

const SCHEMA_ID = 101;
const DEPTH_TEMPLATE_ID = 2;
const UTF8_STUB_PREFIX = 'DepthLevel:';

const BOOK = {
  marketId: 'BTC-USDT',
  sequence: 10,
  bids: [['100', '1']] as const,
  asks: [['101', '1']] as const,
};

function readHeader(payload: Uint8Array): { schemaId: number; templateId: number } {
  const view = Buffer.from(payload);
  return { templateId: view.readUInt16LE(2), schemaId: view.readUInt16LE(4) };
}

const java = loadJavaSbeCodec();
if (java === null) {
  process.stdout.write('sbe_unavailable — Java SBE not linked\n');
  process.exit(0);
}

const encoded = encodeL2Snapshot(createSbeCodec({ java }), BOOK);
if (!encoded.ok) {
  process.stderr.write(`linked L2 encode refused: ${encoded.reason} ${encoded.message}\n`);
  process.exit(1);
}
if (encoded.book !== 'L2' || encoded.template !== 'DepthLevel' || encoded.payloads.length !== 2) {
  process.stderr.write('linked L2 shape drifted\n');
  process.exit(1);
}
for (const payload of encoded.payloads) {
  const text = Buffer.from(payload).toString('utf8');
  if (text.startsWith(UTF8_STUB_PREFIX) || text.includes('protobuf')) {
    process.stderr.write('linked L2 payload is utf8 stub or protobuf\n');
    process.exit(1);
  }
  const header = readHeader(payload);
  if (header.schemaId !== SCHEMA_ID || header.templateId !== DEPTH_TEMPLATE_ID) {
    process.stderr.write(`schemaId=${header.schemaId} templateId=${header.templateId}\n`);
    process.exit(1);
  }
}
process.stdout.write('linked L2 octets ok schemaId=101 templateId=2\n');
