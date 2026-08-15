/**
 * Durable waitlist + referral queue (drop 0 tease).
 *
 * Email capture and FIFO position only. No IFC, no token rewards, no ledger.
 * Distinct from `referral_edges` (account affiliate tree).
 */

import { randomBytes, randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';

export type WaitlistEntry = {
  readonly id: string;
  readonly email: string;
  readonly referralCode: string;
  readonly referredBy: string | null;
  readonly position: number;
  readonly referredCount: number;
  readonly createdAt: Date;
};

export type WaitlistEnrollResult = {
  readonly entry: WaitlistEntry;
  /** false = same email already on the list; row unchanged. */
  readonly created: boolean;
};

export interface WaitlistStore {
  enroll(input: { email: string; referredBy?: string | null }): Promise<WaitlistEnrollResult>;
  getByCode(referralCode: string): Promise<WaitlistEntry | null>;
  getByEmail(email: string): Promise<WaitlistEntry | null>;
  list(input: { limit: number; offset: number }): Promise<{ total: number; entries: readonly WaitlistEntry[] }>;
  count(): Promise<number>;
}

export class WaitlistStoreError extends Error {
  constructor(
    message: string,
    readonly code: 'waitlist.invalid' | 'waitlist.unknown_referrer' | 'waitlist.self_referral',
  ) {
    super(message);
    this.name = 'WaitlistStoreError';
  }
}

const CODE_RE = /^[a-f0-9]{12}$/;

export function normalizeWaitlistEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email || !email.includes('@') || email.length > 320) {
    throw new WaitlistStoreError('Waitlist email is invalid', 'waitlist.invalid');
  }
  return email;
}

export function normalizeReferralCode(raw: string): string {
  const code = raw.trim().toLowerCase();
  if (!CODE_RE.test(code)) {
    throw new WaitlistStoreError('Referral code is invalid', 'waitlist.invalid');
  }
  return code;
}

export function newReferralCode(): string {
  return randomBytes(6).toString('hex');
}

function toEntry(row: {
  id: string;
  email: string;
  referral_code: string;
  referred_by: string | null;
  position: string | number | bigint;
  referred_count: number;
  created_at: Date;
}): WaitlistEntry {
  return {
    id: row.id,
    email: row.email,
    referralCode: row.referral_code,
    referredBy: row.referred_by,
    position: Number(row.position),
    referredCount: row.referred_count,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/** In-memory store for unit / router tests. */
export class MemoryWaitlistStore implements WaitlistStore {
  private readonly byEmail = new Map<string, WaitlistEntry>();
  private readonly byCode = new Map<string, WaitlistEntry>();
  private nextPosition = 1;

  async enroll(input: { email: string; referredBy?: string | null }): Promise<WaitlistEnrollResult> {
    const email = normalizeWaitlistEmail(input.email);
    const existing = this.byEmail.get(email);
    if (existing) return { entry: existing, created: false };

    const referredBy = input.referredBy ? normalizeReferralCode(input.referredBy) : null;
    if (referredBy) {
      const referrer = this.byCode.get(referredBy);
      if (!referrer) throw new WaitlistStoreError('Referral code is not on the waitlist', 'waitlist.unknown_referrer');
      if (referrer.email === email) {
        throw new WaitlistStoreError('Self-referral is refused', 'waitlist.self_referral');
      }
    }

    let code = newReferralCode();
    while (this.byCode.has(code)) code = newReferralCode();

    const entry: WaitlistEntry = {
      id: randomUUID(),
      email,
      referralCode: code,
      referredBy,
      position: this.nextPosition++,
      referredCount: 0,
      createdAt: new Date(),
    };
    this.byEmail.set(email, entry);
    this.byCode.set(code, entry);

    if (referredBy) {
      const referrer = this.byCode.get(referredBy);
      if (referrer) {
        const bumped: WaitlistEntry = { ...referrer, referredCount: referrer.referredCount + 1 };
        this.byCode.set(referrer.referralCode, bumped);
        this.byEmail.set(referrer.email, bumped);
      }
    }

    return { entry, created: true };
  }

  async getByCode(referralCode: string): Promise<WaitlistEntry | null> {
    return this.byCode.get(normalizeReferralCode(referralCode)) ?? null;
  }

  async getByEmail(email: string): Promise<WaitlistEntry | null> {
    return this.byEmail.get(normalizeWaitlistEmail(email)) ?? null;
  }

  async list(input: { limit: number; offset: number }): Promise<{ total: number; entries: readonly WaitlistEntry[] }> {
    const all = [...this.byEmail.values()].sort((a, b) => a.position - b.position);
    const limit = Math.min(Math.max(input.limit, 1), 200);
    const offset = Math.max(input.offset, 0);
    return { total: all.length, entries: all.slice(offset, offset + limit) };
  }

  async count(): Promise<number> {
    return this.byEmail.size;
  }
}

export class SqlWaitlistStore implements WaitlistStore {
  constructor(private readonly sql: Sql) {}

  async enroll(input: { email: string; referredBy?: string | null }): Promise<WaitlistEnrollResult> {
    const email = normalizeWaitlistEmail(input.email);
    const referredBy = input.referredBy ? normalizeReferralCode(input.referredBy) : null;

    return transaction(this.sql, async (tx) => {
      const existing = await tx<Array<Parameters<typeof toEntry>[0]>>`
        SELECT id, email, referral_code, referred_by, position, referred_count, created_at
        FROM waitlist_entries
        WHERE email = ${email}
        LIMIT 1
      `;
      if (existing[0]) return { entry: toEntry(existing[0]), created: false };

      if (referredBy) {
        const referrer = await tx<Array<{ email: string }>>`
          SELECT email FROM waitlist_entries WHERE referral_code = ${referredBy} LIMIT 1
        `;
        if (!referrer[0]) {
          throw new WaitlistStoreError('Referral code is not on the waitlist', 'waitlist.unknown_referrer');
        }
        if (referrer[0].email.toLowerCase() === email) {
          throw new WaitlistStoreError('Self-referral is refused', 'waitlist.self_referral');
        }
      }

      let inserted: Parameters<typeof toEntry>[0] | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newReferralCode();
        try {
          const rows = await tx<Array<Parameters<typeof toEntry>[0]>>`
            INSERT INTO waitlist_entries (email, referral_code, referred_by)
            VALUES (${email}, ${code}, ${referredBy})
            RETURNING id, email, referral_code, referred_by, position, referred_count, created_at
          `;
          inserted = rows[0];
          break;
        } catch (err) {
          if ((err as { code?: string } | null)?.code !== '23505') throw err;
          const raced = await tx<Array<Parameters<typeof toEntry>[0]>>`
            SELECT id, email, referral_code, referred_by, position, referred_count, created_at
            FROM waitlist_entries
            WHERE email = ${email}
            LIMIT 1
          `;
          if (raced[0]) return { entry: toEntry(raced[0]), created: false };
          // Unique on referral_code — retry a new code.
        }
      }
      if (!inserted) throw new WaitlistStoreError('Could not allocate a referral code', 'waitlist.invalid');

      if (referredBy) {
        await tx`
          UPDATE waitlist_entries
          SET referred_count = referred_count + 1
          WHERE referral_code = ${referredBy}
        `;
      }

      return { entry: toEntry(inserted), created: true };
    });
  }

  async getByCode(referralCode: string): Promise<WaitlistEntry | null> {
    const code = normalizeReferralCode(referralCode);
    const rows = await this.sql<Array<Parameters<typeof toEntry>[0]>>`
      SELECT id, email, referral_code, referred_by, position, referred_count, created_at
      FROM waitlist_entries
      WHERE referral_code = ${code}
      LIMIT 1
    `;
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async getByEmail(email: string): Promise<WaitlistEntry | null> {
    const normalised = normalizeWaitlistEmail(email);
    const rows = await this.sql<Array<Parameters<typeof toEntry>[0]>>`
      SELECT id, email, referral_code, referred_by, position, referred_count, created_at
      FROM waitlist_entries
      WHERE email = ${normalised}
      LIMIT 1
    `;
    return rows[0] ? toEntry(rows[0]) : null;
  }

  async list(input: { limit: number; offset: number }): Promise<{ total: number; entries: readonly WaitlistEntry[] }> {
    const limit = Math.min(Math.max(input.limit, 1), 200);
    const offset = Math.max(input.offset, 0);
    const totalRows = await this.sql<Array<{ n: string }>>`SELECT count(*)::text AS n FROM waitlist_entries`;
    const rows = await this.sql<Array<Parameters<typeof toEntry>[0]>>`
      SELECT id, email, referral_code, referred_by, position, referred_count, created_at
      FROM waitlist_entries
      ORDER BY position ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return { total: Number(totalRows[0]?.n ?? 0), entries: rows.map(toEntry) };
  }

  async count(): Promise<number> {
    const rows = await this.sql<Array<{ n: string }>>`SELECT count(*)::text AS n FROM waitlist_entries`;
    return Number(rows[0]?.n ?? 0);
  }
}
