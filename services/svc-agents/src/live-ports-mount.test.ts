import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, 'index.ts'), 'utf8');

describe('svc-agents live ports mount', () => {
  it('index wires Class X HTTP ports from fleet env URLs', () => {
    const src = indexSrc();
    expect(src).toContain('env.SUPPORT_URL');
    expect(src).toContain('createHttpSupportDeskPort');
    expect(src).toContain('env.TRADE_URL');
    expect(src).toContain('createHttpSpotTickersPort');
    expect(src).toContain('createHttpCopyLeaderFixturesPort');
    expect(src).toContain('createHttpNavigatorTradeDataPort');
    expect(src).toContain('navigatorTradeUrl: env.TRADE_URL');
    expect(src).toContain('env.PAY_URL');
    expect(src).toContain('createHttpPayMetricsPort');
    expect(src).toContain('env.IDENTITY_URL');
    expect(src).toContain('createHttpNavigatorIdentitySessionPort');
  });

  it('passes live ports into createAgentsRouter', () => {
    const src = indexSrc();
    expect(src).toContain('spotTickersPort');
    expect(src).toContain('payMetricsPort');
    expect(src).toContain('copyLeaderFixturesPort');
    expect(src).toContain('navigatorTradeDataPort');
    expect(src).toContain('navigatorIdentitySessionPort');
    expect(src).toContain('supportDesk');
  });
});
