import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { matchingOrderCommandSchema, parseMatchingOrderCommand } from './command.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const valid = {
  kind: 'new_order_single' as const,
  clOrdId: 'clid-1',
  beginString: 'FIX.4.4' as const,
  symbol: 'BTC/USDT',
  side: 'buy' as const,
  ordType: 'limit' as const,
  qty: '1.50',
  price: '100.25',
};

describe('matching order command — decimal strings, no book', () => {
  it('accepts decimal-string qty and price', () => {
    expect(parseMatchingOrderCommand(valid)).toEqual(valid);
  });

  it('refuses JS number qty', () => {
    const r = matchingOrderCommandSchema.safeParse({ ...valid, qty: 1.5 });
    expect(r.success).toBe(false);
  });

  it('refuses JS number price', () => {
    const r = matchingOrderCommandSchema.safeParse({ ...valid, price: 100.25 });
    expect(r.success).toBe(false);
  });

  it('refuses IEEE-looking exponent qty', () => {
    const r = matchingOrderCommandSchema.safeParse({ ...valid, qty: '1e-2' });
    expect(r.success).toBe(false);
  });

  it('market command keeps price null rather than a number', () => {
    const cmd = parseMatchingOrderCommand({ ...valid, ordType: 'market', price: null });
    expect(cmd.price).toBeNull();
    expect(typeof cmd.qty).toBe('string');
  });

  it('accepts optional senderCompId and tif without inventing them', () => {
    const cmd = parseMatchingOrderCommand({ ...valid, senderCompId: 'CLIENT', tif: 'GTC' });
    expect(cmd.senderCompId).toBe('CLIENT');
    expect(cmd.tif).toBe('GTC');
  });
});

describe('adapter boundary — not a ledger, not npm FIX', () => {
  it('package.json does not depend on ledger-client, ccxt, or node-quickfix', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    expect(names).not.toContain('@intafaced/ledger-client');
    expect(names.some((n) => n.toLowerCase().includes('ccxt'))).toBe(false);
    expect(names.some((n) => n.toLowerCase().includes('quickfix') && n.toLowerCase().includes('node'))).toBe(false);
  });

  it('pins QuickFIX/J 3.0.2 and does not declare Java balances', () => {
    const pom = readFileSync(join(root, 'pom.xml'), 'utf8');
    expect(pom).toContain('<quickfixj.version>3.0.2</quickfixj.version>');
    expect(pom).toContain('quickfixj-core');
    expect(pom.toLowerCase()).not.toContain('memberwallet');
    expect(pom.toLowerCase()).not.toContain('ledger-client');
    const adapter = readFileSync(join(root, 'src/main/java/io/intafaced/fix/FixGatewayAdapter.java'), 'utf8');
    expect(adapter).not.toMatch(/\bgetDouble\s*\(/);
    expect(adapter).not.toMatch(/\bDoubleField\b/);
    expect(adapter).not.toMatch(/ledger-client/);
    expect(adapter).not.toMatch(/MemberWallet/);
    expect(adapter).not.toMatch(/\bsetBalance\s*\(/);
  });
});
