import { describe, expect, it } from 'vitest';
import { optionsOwnerEnvComposeGapsClosed, tradeComposeBlock } from './options-compose-wiring.js';

describe('trade.options fleet compose wiring', () => {
  it('closes P0-05 settlement law + D7 fixing compose gaps', () => {
    expect(optionsOwnerEnvComposeGapsClosed()).toBe(true);
  });

  it('options jobs default OFF — never true on a clean clone', () => {
    expect(tradeComposeBlock()).toMatch(/TRADE_OPTIONS_JOBS_ENABLED:\s*\$\{TRADE_OPTIONS_JOBS_ENABLED:-false\}/);
    expect(tradeComposeBlock()).not.toMatch(/TRADE_OPTIONS_JOBS_ENABLED:\s*\$\{TRADE_OPTIONS_JOBS_ENABLED:-true\}/);
  });
});
