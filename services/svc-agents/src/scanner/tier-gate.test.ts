import { describe, expect, it } from 'vitest';
import { SCANNER_DATA_TOOLS } from './guardrail.js';
import { isScannerTierGateOk, scannerTierGate, scannerTierGateBoardCard } from './tier-gate.js';

describe('scannerTierGate (Stage-2 signal depth)', () => {
  it('refuse-closed when law blank / unpublished', () => {
    expect(scannerTierGate({ law: null, userTier: 'free' })).toEqual({
      status: 'refuse',
      reason: 'tier_law_blank',
      userMessageKey: 'agents.scanner.tier_closed',
    });
    const unpublished = scannerTierGate({ law: { published: false }, userTier: 'free' });
    expect(unpublished.status).toBe('refuse');
    if (unpublished.status === 'refuse') expect(unpublished.reason).toBe('tier_law_blank');
    const emptyMatrix = scannerTierGate({ law: { published: true, matrix: {} }, userTier: 'free' });
    expect(emptyMatrix.status).toBe('refuse');
    if (emptyMatrix.status === 'refuse') expect(emptyMatrix.reason).toBe('tier_law_blank');
  });

  it('refuse when tier not in matrix — no invent free depth', () => {
    const r = scannerTierGate({
      law: {
        published: true,
        matrix: { staked: { maxSignals: 10, tools: [...SCANNER_DATA_TOOLS] } },
      },
      userTier: 'free',
    });
    expect(r).toEqual({
      status: 'refuse',
      reason: 'tier_not_granted',
      userMessageKey: 'agents.scanner.tier_closed',
    });
  });

  it('refuse when maxSignals invalid', () => {
    const r = scannerTierGate({
      law: {
        published: true,
        matrix: { free: { maxSignals: 0, tools: [...SCANNER_DATA_TOOLS] } },
      },
      userTier: 'free',
    });
    expect(r.status).toBe('refuse');
    if (r.status !== 'refuse') return;
    expect(r.reason).toBe('depth_invalid');
  });

  it('opens with published depth + tools', () => {
    const r = scannerTierGate({
      law: {
        published: true,
        matrix: { free: { maxSignals: 3, tools: ['trade.ticker'] } },
      },
      userTier: 'free',
    });
    expect(isScannerTierGateOk(r)).toBe(true);
    if (r.status !== 'ok') return;
    expect(r.maxSignals).toBe(3);
    expect(r.allowedTools).toEqual(['trade.ticker']);
    expect(scannerTierGateBoardCard(r)).toEqual({
      ok: true,
      reason: null,
      maxSignals: 3,
      toolCount: 1,
    });
  });
});
