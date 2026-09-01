import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createSbeCodec, sbeCodec } from './codec.js';
import type { EncodeInput, JavaSbeCodec } from './types.js';
import { SBE_UNAVAILABLE } from './types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function trade(): EncodeInput {
  return {
    template: 'Trade',
    instrument: 'BTCUSDT',
    tradeId: '9',
    side: 'buy',
    price: '100.25',
    qty: '1.50',
    eventTimeNs: '1',
  };
}

describe('sbe codec — pin, schema, not protobuf, not a book', () => {
  it('schema is SBE XML with decimal mantissa/exponent, not protobuf', () => {
    const schema = readFileSync(join(root, 'schema', 'intafaced-md.xml'), 'utf8');
    expect(schema).toContain('http://fixprotocol.io/2016/sbe');
    expect(schema).toContain('name="Trade"');
    expect(schema).toContain('name="DepthLevel"');
    expect(schema).toContain('DecimalEncoding');
    expect(schema).toContain('primitiveType="int64"');
    expect(schema.toLowerCase()).not.toContain('protobuf');
    expect(schema.toLowerCase()).not.toContain('proto3');
  });

  it('package.json does not depend on ledger-client, protobuf, ccxt, or nats', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(names).not.toContain('@intafaced/ledger-client');
    expect(names.some((n) => n.toLowerCase().includes('protobuf'))).toBe(false);
    expect(names.some((n) => n.toLowerCase().includes('ccxt'))).toBe(false);
    expect(names.some((n) => n.toLowerCase() === 'nats' || n.includes('nats.js'))).toBe(false);
  });

  it('pom pins sbe-tool 1.39.0 and does not declare a money book', () => {
    const pom = readFileSync(join(root, 'pom.xml'), 'utf8');
    expect(pom).toContain('<sbe.version>1.39.0</sbe.version>');
    expect(pom).toContain('uk.co.real-logic');
    expect(pom).toContain('sbe-tool');
    expect(pom.toLowerCase()).not.toContain('memberwallet');
    expect(pom.toLowerCase()).not.toContain('protobuf');
    expect(pom.toLowerCase()).not.toContain('aeron-client');
  });
});

describe('sbe codec — missing / IEEE inputs refuse even if Java is present', () => {
  const stub: JavaSbeCodec = {
    handle: () => {
      throw new Error('java must not be called when inputs are missing');
    },
  };
  const adapter = createSbeCodec({ java: stub });

  it('refuses a missing price without calling Java', () => {
    const { price: _p, ...rest } = trade();
    const result = adapter.encode(rest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing_input');
    expect(result.field).toBe('price');
    expect('payload' in result).toBe(false);
  });

  it('refuses JS number qty', () => {
    const result = adapter.encode({
      ...trade(),
      qty: 1.5 as unknown as string,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('ieee_input');
    expect(result.field).toBe('qty');
  });

  it('refuses scientific-notation price', () => {
    const result = adapter.encode({ ...trade(), price: '1e-2' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_decimal');
  });
});

describe('sbe codec — official stubs encode/decode or refuse sbe_unavailable', () => {
  it('roundtrips trade qty/price as decimal strings when Java SBE is linked', () => {
    if (!sbeCodec.linked) {
      const result = sbeCodec.encode(trade());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe(SBE_UNAVAILABLE);
      expect('payload' in result).toBe(false);
      return;
    }
    const encoded = sbeCodec.encode(trade());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.template).toBe('Trade');
    expect(encoded.payload.byteLength).toBeGreaterThan(8);
    const decoded = sbeCodec.decode(encoded.payload);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.template).toBe('Trade');
    if (decoded.template !== 'Trade') return;
    expect(decoded.instrument).toBe('BTCUSDT');
    expect(decoded.side).toBe('buy');
    expect(decoded.price).toBe('100.25');
    expect(decoded.qty).toBe('1.5');
    expect(decoded.tradeId).toBe('9');
    expect(typeof decoded.price).toBe('string');
    expect(typeof decoded.qty).toBe('string');
  });

  it('roundtrips a depth level', () => {
    if (!sbeCodec.linked) {
      const result = sbeCodec.encode({
        template: 'DepthLevel',
        instrument: 'ETHUSDT',
        sequence: '7',
        side: 'sell',
        price: '0.00000001',
        qty: '12',
        eventTimeNs: '2',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe(SBE_UNAVAILABLE);
      return;
    }
    const encoded = sbeCodec.encode({
      template: 'DepthLevel',
      instrument: 'ETHUSDT',
      sequence: '7',
      side: 'sell',
      price: '0.00000001',
      qty: '12',
      eventTimeNs: '2',
    });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const decoded = sbeCodec.decode(encoded.payloadB64);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.template).toBe('DepthLevel');
    if (decoded.template !== 'DepthLevel') return;
    expect(decoded.price).toBe('0.00000001');
    expect(decoded.qty).toBe('12');
    expect(decoded.side).toBe('sell');
  });
});
