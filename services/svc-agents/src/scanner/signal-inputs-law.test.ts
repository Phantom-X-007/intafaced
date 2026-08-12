import { describe, expect, it } from 'vitest';
import {
  P0_11_BOARD_ID,
  SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
  SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW,
  UNPUBLISHED_SCANNER_SIGNAL_INPUTS_LAW,
  scannerSignalInputsGate,
  scannerSignalInputsGateBoardCard,
  scannerSignalInputsGateStatusLine,
} from './signal-inputs-law.js';

describe('scannerSignalInputsGate (D26-P0-11 / D26-P1-A3)', () => {
  it('refuse-closed when law blank / unpublished — no invent rankings', () => {
    for (const law of [null, undefined, UNPUBLISHED_SCANNER_SIGNAL_INPUTS_LAW, { published: false as const }]) {
      const r = scannerSignalInputsGate(law);
      expect(r).toEqual({
        status: 'refuse',
        reason: 'signal_inputs_law_blank',
        userMessageKey: 'agents.scanner.signal_inputs_closed',
        residual: SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL,
        boardId: P0_11_BOARD_ID,
      });
      expect(scannerSignalInputsGateBoardCard(r)).toEqual({
        ok: false,
        reason: 'signal_inputs_law_blank',
        boardId: P0_11_BOARD_ID,
        recipeId: null,
        inputCount: 0,
      });
      expect(scannerSignalInputsGateStatusLine(r)).toBe(
        'ok=0 board=D26-P0-11 reason=signal_inputs_law_blank residual=D26-P0-11_refuse_closed',
      );
    }
  });

  it('refuse-closed when published but p0_11 seal marker missing', () => {
    const r = scannerSignalInputsGate({
      published: true,
      // @ts-expect-error — deliberate hostile shape: published without seal
      p0_11: 'draft',
      allowedInputs: ['last', 'volume24h', 'change24hBps'],
      rankingRecipeId: 'abs_change_x_log_volume',
    });
    expect(r.status).toBe('refuse');
    if (r.status === 'refuse') expect(r.reason).toBe('signal_inputs_law_blank');
  });

  it('refuse-closed when allowedInputs empty — owner named nothing to rank on', () => {
    const r = scannerSignalInputsGate({
      published: true,
      p0_11: 'sealed',
      allowedInputs: [],
      rankingRecipeId: 'abs_change_x_log_volume',
    });
    expect(r).toMatchObject({
      status: 'refuse',
      reason: 'inputs_empty',
      userMessageKey: 'agents.scanner.signal_inputs_closed',
      boardId: P0_11_BOARD_ID,
    });
  });

  it('refuse-closed when ranking recipe is not the sealed Stage-1 id', () => {
    const r = scannerSignalInputsGate({
      published: true,
      p0_11: 'sealed',
      allowedInputs: ['last', 'volume24h', 'change24hBps'],
      // @ts-expect-error — invent recipe must not open the gate
      rankingRecipeId: 'momentum_alpha_v2',
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'ranking_recipe_unknown' });
  });

  it('refuse-closed when sealed recipe is missing a required input on the allowlist', () => {
    const r = scannerSignalInputsGate({
      published: true,
      p0_11: 'sealed',
      allowedInputs: ['last', 'volume24h'], // missing change24hBps
      rankingRecipeId: 'abs_change_x_log_volume',
    });
    expect(r).toMatchObject({ status: 'refuse', reason: 'required_inputs_missing' });
  });

  it('opens only when P0-11 is sealed with the known recipe + required inputs', () => {
    const r = scannerSignalInputsGate(SEALED_ABS_CHANGE_X_LOG_VOLUME_LAW);
    expect(r).toEqual({
      status: 'ok',
      allowedInputs: ['last', 'volume24h', 'change24hBps'],
      rankingRecipeId: 'abs_change_x_log_volume',
    });
    expect(scannerSignalInputsGateBoardCard(r).ok).toBe(true);
    expect(scannerSignalInputsGateStatusLine(r)).toBe(
      'ok=1 board=D26-P0-11 recipe=abs_change_x_log_volume inputs=3',
    );
  });

  it('residual string names D26-P0-11 and invent ban (high-signal ops grep)', () => {
    expect(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL).toContain('D26-P0-11');
    expect(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL).toMatch(/never invent rankings/i);
    expect(SCANNER_SIGNAL_INPUTS_LAW_RESIDUAL).toMatch(/market alpha/i);
  });
});
