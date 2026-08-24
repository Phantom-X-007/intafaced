import { describe, expect, it } from 'vitest';
import {
  authorityEvidenceSchema,
  canonicalDecimalStringSchema,
  correctionLinkSchema,
  executionCommandEnvelopeSchema,
  executionCommandOutcomeSchema,
  spineSequenceSchema,
} from './spine.js';

const authority = {
  decision: 'AUTHORIZED' as const,
  reasonCode: null,
  legalOwnerId: 'owner-1',
  accountId: 'account-1',
  subAccountId: 'sub-account-1',
  actorId: 'actor-1',
  origin: 'API_CREDENTIAL' as const,
  sessionId: null,
  credentialId: 'credential-1',
  grantId: 'grant-1',
  grantVersion: '7',
  mandateId: null,
  decidedAt: '2026-08-24T12:00:00.000Z',
  freshnessAt: '2026-08-24T12:00:00.000Z',
};

describe('professional exchange spine contract', () => {
  it.each(['0', '1', '-1', '0.000000000000000001', '-0.5', '1000000.0001'])('accepts canonical exact decimal %s', (value) =>
    expect(canonicalDecimalStringSchema.parse(value)).toBe(value),
  );

  it.each([0, 1.2, '01', '1.0', '-0', '1e3', '.5', '0.1234567890123456789'])('refuses non-canonical or lossy decimal %s', (value) => {
    expect(canonicalDecimalStringSchema.safeParse(value).success).toBe(false);
  });

  it('carries sequences as canonical integer strings beyond the JS safe range', () => {
    expect(spineSequenceSchema.parse({ domain: 'matching:BTC-USDT', value: '9007199254740993' })).toEqual({
      domain: 'matching:BTC-USDT',
      value: '9007199254740993',
    });
    expect(spineSequenceSchema.safeParse({ domain: 'matching:BTC-USDT', value: 9_007_199_254_740_993 }).success).toBe(false);
    expect(spineSequenceSchema.safeParse({ domain: 'matching:BTC-USDT', value: '01' }).success).toBe(false);
  });

  it('requires complete attributable authority evidence', () => {
    expect(authorityEvidenceSchema.parse(authority)).toEqual(authority);
    expect(authorityEvidenceSchema.safeParse({ ...authority, credentialId: null }).success).toBe(false);
    expect(authorityEvidenceSchema.safeParse({ ...authority, origin: 'HUMAN_SESSION', sessionId: null }).success).toBe(false);
    expect(authorityEvidenceSchema.safeParse({ ...authority, legalOwnerId: '' }).success).toBe(false);
    expect(authorityEvidenceSchema.safeParse({ ...authority, decision: 'REFUSED', reasonCode: null }).success).toBe(false);
  });

  it('pins the IDs, versions, clocks, authority, and sequence of an execution command', () => {
    const parsed = executionCommandEnvelopeSchema.parse({
      commandId: 'command-1',
      idempotencyKey: 'place:account-1:client-1',
      idempotencyScope: 'account-1:prod',
      orderId: 'order-1',
      clientOrderId: 'client-1',
      instructionVersion: '1',
      expectedInstructionVersion: '1',
      parentOrderId: null,
      childOrderId: null,
      ruleVersion: 'rule-4',
      instrumentId: 'BTC-USDT',
      instrumentVersion: 'instrument-9',
      marketId: 'market-1',
      environment: 'production',
      plane: 'FIAT',
      provenance: 'NATIVE',
      causalPredecessorId: null,
      authority,
      clock: {
        sourceAt: '2026-08-24T11:59:59.999Z',
        receivedAt: '2026-08-24T12:00:00.000Z',
        clockSource: 'gateway-clock',
        precision: 'milliseconds',
      },
      sequence: { domain: 'matching:BTC-USDT', value: '42' },
    });

    expect(parsed.ruleVersion).toBe('rule-4');
    expect(parsed.authority.legalOwnerId).toBe('owner-1');
  });

  it('separates refusal from an outcome that must be reconciled before retry', () => {
    expect(
      executionCommandOutcomeSchema.parse({
        outcome: 'OUTCOME_UNKNOWN',
        commandId: 'command-1',
        state: 'SUBMIT_UNKNOWN',
        reasonCode: 'venue.timeout_after_dispatch',
        reconciliationKey: 'lookup:client-1',
        observedAt: '2026-08-24T12:00:01.000Z',
      }).outcome,
    ).toBe('OUTCOME_UNKNOWN');

    expect(
      executionCommandOutcomeSchema.safeParse({
        outcome: 'OUTCOME_UNKNOWN',
        commandId: 'command-1',
        state: 'ENGINE_REJECTED',
        reasonCode: 'venue.timeout_after_dispatch',
        reconciliationKey: null,
        observedAt: '2026-08-24T12:00:01.000Z',
      }).success,
    ).toBe(false);
  });

  it('requires a ledger transaction for every value-impacting correction', () => {
    const base = {
      correctionId: 'correction-1',
      originalRecordId: 'fill-1',
      causalPredecessorId: 'case-1',
      reasonCode: 'trade.bust',
      authorityRef: 'approval-1',
      correctedAt: '2026-08-24T12:01:00.000Z',
    };

    expect(correctionLinkSchema.safeParse({ ...base, valueImpact: 'LEDGER_POSTED', ledgerTransactionId: null }).success).toBe(false);
    expect(correctionLinkSchema.safeParse({ ...base, valueImpact: 'NONE', ledgerTransactionId: 'ledger-tx-1' }).success).toBe(false);
    expect(correctionLinkSchema.safeParse({ ...base, valueImpact: 'LEDGER_POSTED', ledgerTransactionId: 'ledger-tx-1' }).success).toBe(
      true,
    );
  });
});
