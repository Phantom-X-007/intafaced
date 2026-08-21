import { describe, expect, it } from 'vitest';
import { formatApprovalRate } from './merchant-watch-metrics-project.js';

describe('formatApprovalRate', () => {
  it('returns null when there are no terminal attempts', () => {
    expect(formatApprovalRate(0, 0)).toBeNull();
  });

  it('formats captured vs failed as a decimal string', () => {
    expect(formatApprovalRate(91, 9)).toBe('0.9100');
    expect(formatApprovalRate(0, 10)).toBe('0.0000');
  });
});
