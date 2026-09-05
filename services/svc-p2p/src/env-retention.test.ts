import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Cross-field retention vs dispute-SLA floor (audit P4).
 *
 * Mirrored here as pure zod so we prove the relationship without booting the
 * full service env (which pulls edge/ledger secrets). The schema fragment is
 * the same check as `env.ts` superRefine.
 */
const fragment = z
  .object({
    P2P_DISPUTE_SLA_SECONDS: z.coerce.number().int().min(3600),
    P2P_INSTRUMENT_RETENTION_DAYS: z.number().int().min(30).max(3_650).nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.P2P_INSTRUMENT_RETENTION_DAYS == null) return;
    const retentionSeconds = value.P2P_INSTRUMENT_RETENTION_DAYS * 24 * 60 * 60;
    if (retentionSeconds < value.P2P_DISPUTE_SLA_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['P2P_INSTRUMENT_RETENTION_DAYS'],
        message: 'retention shorter than dispute SLA',
      });
    }
  });

describe('instrument retention vs dispute SLA', () => {
  it('accepts published 90d retention with 7d SLA — does not invent 90 when blank', () => {
    expect(
      fragment.safeParse({
        P2P_DISPUTE_SLA_SECONDS: 7 * 24 * 60 * 60,
        P2P_INSTRUMENT_RETENTION_DAYS: 90,
      }).success,
    ).toBe(true);
    expect(
      fragment.safeParse({
        P2P_DISPUTE_SLA_SECONDS: 7 * 24 * 60 * 60,
        P2P_INSTRUMENT_RETENTION_DAYS: null,
      }).success,
    ).toBe(true);
  });

  it('refuses a 60-day SLA when retention is only 30 days', () => {
    const result = fragment.safeParse({
      P2P_DISPUTE_SLA_SECONDS: 60 * 24 * 60 * 60,
      P2P_INSTRUMENT_RETENTION_DAYS: 30,
    });
    expect(result.success).toBe(false);
  });

  it('accepts when retention just covers the SLA', () => {
    expect(
      fragment.safeParse({
        P2P_DISPUTE_SLA_SECONDS: 30 * 24 * 60 * 60,
        P2P_INSTRUMENT_RETENTION_DAYS: 30,
      }).success,
    ).toBe(true);
  });
});
