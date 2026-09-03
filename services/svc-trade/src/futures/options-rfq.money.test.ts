/**
 * CARD E4 money proof — options RFQ (PTX-M11-R06 PTX-M12-R02).
 *
 * Hitch: quoteOptionsRfq refuses before any ledger post.
 * Unset principal/agency refuses. Undisclosed last look refuses.
 * Blank off-book cap does not inherit the book. matching/ not folded.
 * Not a redo of F8/#3769.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase, postgresAvailable, type TestDatabase } from '@intafaced/db';
import { MemoryLedger, recipes } from '@intafaced/ledger-client';
import { describe, expect, it, afterAll } from 'vitest';
import {
  RFQ_CAPACITY_UNSET,
  RFQ_CAPACITY_UNSUPPORTED,
  RFQ_LAST_LOOK_UNDISCLOSED,
  RFQ_OFFBOOK_LEVERAGE_UNSET,
  checkOptionsRfq,
  quoteOptionsRfq,
} from './options-rfq.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgres://intafaced_ops:intafaced_ops@localhost:5433/intafaced_test';
const here = dirname(fileURLToPath(import.meta.url));
const drizzle = join(here, '..', '..', 'drizzle');
const matchingRoot = join(here, '..', '..', '..', 'svc-matching');
const migrations = readdirSync(drizzle)
  .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
  .sort()
  .map((f) => readFileSync(join(drizzle, f), 'utf8'));

const OWNER = { capacity: 'principal', offBookLeverageCap: 5 } as const;

describe('options RFQ hitch (source) — matching not folded, book cap not inherited', () => {
  it('options-rfq.ts refuses unset capacity and does not copy book leverage', () => {
    const mill = readFileSync(join(here, 'options-rfq.ts'), 'utf8');
    expect(mill).toMatch(/checkOptionsRfq/);
    expect(mill).toMatch(/quoteOptionsRfq/);
    expect(mill).toMatch(/TRADE_OPTIONS_RFQ_CAPACITY/);
    expect(mill).toMatch(/inherit the book's leverage cap/);
    expect(mill).not.toMatch(/bookLeverageCap\s*\?\?/);
    expect(mill).not.toMatch(/offBookLeverageCap\s*=\s*book/);
  });

  it('router.ts / matching not recut', () => {
    const routerSrc = readFileSync(join(here, '..', 'router.ts'), 'utf8');
    expect(routerSrc).not.toMatch(/options-rfq/);
    expect(routerSrc).not.toMatch(/rfq_capacity_unset/);
    const matchingFiles = readdirSync(matchingRoot, { recursive: true, encoding: 'utf8' }) as string[];
    expect(matchingFiles.some((f) => String(f).includes('options-rfq'))).toBe(false);
  });
});

describe('options RFQ mill (hermetic)', () => {
  it('unset / blank / unknown capacity refuses', () => {
    expect(checkOptionsRfq({})).toMatchObject({ ok: false, code: RFQ_CAPACITY_UNSET });
    expect(checkOptionsRfq({ capacity: '' })).toMatchObject({ ok: false, code: RFQ_CAPACITY_UNSET });
    expect(checkOptionsRfq({ capacity: 'market_maker' })).toMatchObject({
      ok: false,
      code: RFQ_CAPACITY_UNSUPPORTED,
    });
  });

  it('undisclosed last look refuses', () => {
    expect(
      checkOptionsRfq({ capacity: 'agency', lastLook: true, offBookLeverageCap: OWNER.offBookLeverageCap }),
    ).toMatchObject({ ok: false, code: RFQ_LAST_LOOK_UNDISCLOSED });
    expect(
      checkOptionsRfq({
        capacity: 'agency',
        lastLook: true,
        lastLookDisclosed: true,
        offBookLeverageCap: OWNER.offBookLeverageCap,
      }),
    ).toMatchObject({ ok: true, capacity: 'agency' });
  });

  it('blank off-book cap refuses and does not inherit the book', () => {
    expect(
      checkOptionsRfq({ capacity: 'principal', bookLeverageCap: 20 }),
    ).toMatchObject({ ok: false, code: RFQ_OFFBOOK_LEVERAGE_UNSET });
    expect(
      checkOptionsRfq({ capacity: 'principal', offBookLeverageCap: '', bookLeverageCap: 20 }),
    ).toMatchObject({ ok: false, code: RFQ_OFFBOOK_LEVERAGE_UNSET });
    const admitted = checkOptionsRfq({
      capacity: OWNER.capacity,
      offBookLeverageCap: OWNER.offBookLeverageCap,
      bookLeverageCap: 20,
    });
    expect(admitted).toMatchObject({ ok: true, offBookLeverageCap: 5 });
    if (admitted.ok) expect(admitted.offBookLeverageCap).not.toBe(20);
  });
});

const available = await postgresAvailable(URL);

if (!available) {
  describe.skip('svc-trade options RFQ E4 money (Postgres unavailable — start docker compose)', () => {
    it('skipped', () => undefined);
  });
} else {
  const db: TestDatabase = await createTestDatabase({ service: 'trade', url: URL, migrations });

  describe('svc-trade options RFQ E4 money', () => {
    afterAll(async () => {
      await db.drop();
    }, 30_000);

    it('unset capacity: quoteOptionsRfq refuses; post is never called; zero journal', async () => {
      const ledger = new MemoryLedger();
      let posted = 0;
      const check = await quoteOptionsRfq({
        post: async () => {
          posted += 1;
          await ledger.post(
            recipes.deposit({
              userId: '11111111-1111-4111-8111-111111111111',
              assetId: 'USDT',
              amount: 1n,
              rail: 'test',
              railRef: 'e4-should-not',
            }),
          );
        },
      });
      expect(check).toMatchObject({ ok: false, code: RFQ_CAPACITY_UNSET });
      expect(posted).toBe(0);
      expect(ledger.journal()).toHaveLength(0);
    });

    it('undisclosed last look and blank off-book cap refuse with zero posts', async () => {
      const ledger = new MemoryLedger();
      let posted = 0;
      const post = async () => {
        posted += 1;
      };
      expect(await quoteOptionsRfq({ capacity: 'principal', lastLook: true, offBookLeverageCap: 5, post })).toMatchObject({
        ok: false,
        code: RFQ_LAST_LOOK_UNDISCLOSED,
      });
      expect(
        await quoteOptionsRfq({ capacity: 'principal', bookLeverageCap: 20, post }),
      ).toMatchObject({ ok: false, code: RFQ_OFFBOOK_LEVERAGE_UNSET });
      expect(posted).toBe(0);
      expect(ledger.journal()).toHaveLength(0);
    });
  });
}
