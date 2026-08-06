import { describe, expect, it } from 'vitest';
import {
  estimateInputTokensFromText,
  tokenEstimateBoardCard,
  tokenEstimateStatusLine,
  parseTokenEstimateStatusLine,
  tokenEstimateStatusLineMatches,
  tokenEstimateStatusLineConsistent,
  tokenEstimateExportHeader,
  tokenEstimateExportLine,
  tokenEstimateExportText,
  emptyInputEstimatesZero,
} from './token-estimate-honesty.js';

describe('L3 wave109 token estimate honesty', () => {
  it('empty and non-empty estimate boards', () => {
    expect(emptyInputEstimatesZero()).toBe(true);
    expect(estimateInputTokensFromText(undefined, [])).toBe(0);
    expect(tokenEstimateStatusLineMatches({ messages: [] })).toBe(true);
    expect(tokenEstimateStatusLineConsistent(tokenEstimateStatusLine({ messages: [] }))).toBe(true);

    const input = {
      system: 'abc', // 3 chars → 1 token
      messages: [{ content: 'abcdef' }], // 6 chars
    };
    // total 9 chars → 3 tokens (ceil/3, matches runtime.ts)
    expect(tokenEstimateBoardCard(input)).toEqual({
      systemLen: 3,
      messageCount: 1,
      totalChars: 9,
      estimatedTokens: 3,
    });
    expect(tokenEstimateStatusLine(input)).toBe('system_len=3 messages=1 chars=9 tokens=3');
    expect(tokenEstimateStatusLineMatches(input)).toBe(true);
    expect(tokenEstimateStatusLineConsistent(tokenEstimateStatusLine(input))).toBe(true);
    expect(tokenEstimateExportText(input).startsWith(tokenEstimateExportHeader())).toBe(true);
    expect(tokenEstimateExportLine(input)).toBe('3,1,9,3');
    expect(parseTokenEstimateStatusLine('nope')).toBeNull();
  });
});
