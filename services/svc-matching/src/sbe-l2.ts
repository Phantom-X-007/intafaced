/**
 * Public L2 SBE from the engine book. Real Logic schema id 101 DepthLevel octets.
 * Utf8 JSON / "DepthLevel:" stubs are not SBE — refuse rather than label them binary.
 * Never L3. Matching compose does not hitch a second INTAFACED_SBE_JAVA jar.
 */
import { SBE_UNAVAILABLE, type AdapterRefuse, type SbeCodec } from '@intafaced/sbe-codec';

export { SBE_UNAVAILABLE };

export const MATCHING_SBE_UNAVAILABLE = 'matching.sbe_unavailable' as const;
export const MATCHING_SBE_REFUSE_HTTP = 409 as const;
export const SBE_SCHEMA_ID = 101;
export const SBE_DEPTH_TEMPLATE_ID = 2;
const UTF8_STUB_PREFIX = 'DepthLevel:';

export type MatchingL2Ladder = {
  readonly marketId: string;
  readonly sequence: number | string;
  readonly bids: readonly (readonly [string, string])[];
  readonly asks: readonly (readonly [string, string])[];
};

export type EncodeMatchingL2Ok = {
  readonly ok: true;
  readonly book: 'L2';
  readonly template: 'DepthLevel';
  readonly sequence: string;
  readonly payloads: readonly Uint8Array[];
};

export type EncodeMatchingL2Result = EncodeMatchingL2Ok | AdapterRefuse;

export function readSbeHeader(payload: Uint8Array): {
  readonly blockLength: number;
  readonly templateId: number;
  readonly schemaId: number;
  readonly version: number;
} | null {
  if (payload.byteLength < 8) return null;
  const view = Buffer.from(payload);
  return {
    blockLength: view.readUInt16LE(0),
    templateId: view.readUInt16LE(2),
    schemaId: view.readUInt16LE(4),
    version: view.readUInt16LE(6),
  };
}

/** Real Logic DepthLevel frame — not a utf8 marker, not JSON, not protobuf. */
export function isRealLogicDepthFrame(payload: Uint8Array): boolean {
  const header = readSbeHeader(payload);
  if (header === null) return false;
  if (header.schemaId !== SBE_SCHEMA_ID || header.templateId !== SBE_DEPTH_TEMPLATE_ID) return false;
  // Utf8 stubs start with a marker / JSON. Do not scan the whole frame for
  // ASCII — mantissa bytes can contain those sequences by chance.
  const prefix = Buffer.from(payload.subarray(0, Math.min(payload.byteLength, 16))).toString('utf8');
  if (prefix.startsWith(UTF8_STUB_PREFIX) || prefix.startsWith('{')) return false;
  return true;
}

function moneyIsIeee(value: unknown): boolean {
  return typeof value === 'number';
}

function utf8StubRefuse(linked: boolean): AdapterRefuse {
  return {
    ok: false,
    linked,
    reason: SBE_UNAVAILABLE,
    message: 'utf8 stub is not Real Logic SBE 1.39.0',
  };
}

export function encodeMatchingL2Sbe(codec: SbeCodec, snap: MatchingL2Ladder): EncodeMatchingL2Result {
  if (!codec.linked) {
    return {
      ok: false,
      linked: false,
      reason: SBE_UNAVAILABLE,
      message: 'Real Logic SBE 1.39.0 is not linked — refusing rather than serving utf8 as SBE',
    };
  }

  const sequence = String(snap.sequence);
  const payloads: Uint8Array[] = [];
  const levels: Array<{ side: 'buy' | 'sell'; price: string; qty: string }> = [];
  for (const row of snap.bids) {
    if (moneyIsIeee(row[0]) || moneyIsIeee(row[1])) {
      return {
        ok: false,
        linked: codec.linked,
        reason: 'ieee_input',
        field: 'price',
        message: 'L2 money stays decimal strings',
      };
    }
    levels.push({ side: 'buy', price: row[0], qty: row[1] });
  }
  for (const row of snap.asks) {
    if (moneyIsIeee(row[0]) || moneyIsIeee(row[1])) {
      return {
        ok: false,
        linked: codec.linked,
        reason: 'ieee_input',
        field: 'price',
        message: 'L2 money stays decimal strings',
      };
    }
    levels.push({ side: 'sell', price: row[0], qty: row[1] });
  }

  for (const level of levels) {
    const encoded = codec.encode({
      template: 'DepthLevel',
      instrument: snap.marketId,
      sequence,
      side: level.side,
      price: level.price,
      qty: level.qty,
      eventTimeNs: '0',
    });
    if (!encoded.ok) return encoded;
    if (!isRealLogicDepthFrame(encoded.payload)) return utf8StubRefuse(true);
    payloads.push(encoded.payload);
  }

  return { ok: true, book: 'L2', template: 'DepthLevel', sequence, payloads };
}

export function concatenateSbePayloads(payloads: readonly Uint8Array[]): Buffer {
  return Buffer.concat(payloads.map((p) => Buffer.from(p)));
}

export function matchingSbeRefuseBody(
  reason: string,
  message: string,
): {
  readonly code: typeof MATCHING_SBE_UNAVAILABLE;
  readonly reason: string;
  readonly message: string;
} {
  return { code: MATCHING_SBE_UNAVAILABLE, reason, message };
}

export function wantsMatchingSbe(query: { format?: string } | undefined): boolean {
  return query?.format === 'sbe';
}
