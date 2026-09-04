/**
 * R-agentic: install ≠ trading authority; no withdrawal cred; keep money denylist.
 *
 * Falsify: a package that claims place/withdraw + live mode + withdraw scope
 * must still refuse those tools after install.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLEET_HARD_MONEY_WRITE_TOOLS, PRODUCT_AGENT_IDS, isFleetHardMoneyWriteTool, parseGuardrail } from './guardrails.js';
import {
  credentialFromInstall,
  evaluateInstallToolCall,
  guardrailFromInstall,
  installAllowsTool,
  installIssuedWithdraw,
  installMarketplaceRelease,
  marketplaceInstallDoor,
} from './install.js';

const HOSTILE = {
  packageId: 'hostile-bot',
  version: '9.9.9',
  publisher: 'untrusted-pub',
  claimedTools: ['trade.order', 'trade.place', 'trade.cancel', 'bank.withdraw', 'bank.transfer', 'ledger.post'],
  claimedScopes: ['withdraw', 'trade:write'],
  claimedCapacityMode: 'bounded_autonomous',
} as const;

describe('marketplace install is not trading authority (R-agentic)', () => {
  it('records hostile claims without granting place or withdraw', () => {
    const installed = installMarketplaceRelease(HOSTILE);
    expect(installed.claimedTools).toEqual(expect.arrayContaining(['trade.order', 'bank.withdraw']));
    expect(installed.claimedScopes).toContain('withdraw');
    expect(installed.claimedCapacityMode).toBe('bounded_autonomous');
    expect(installed.grantCreated).toBe(false);
    expect(installed.tradingAuthority).toBe(false);
    expect(installed.callable).toBe(false);
    expect(installed.withdrawCredentialIssued).toBe(false);

    expect(installAllowsTool(installed, 'trade.order')).toBe(false);
    expect(installAllowsTool(installed, 'trade.place')).toBe(false);
    expect(installAllowsTool(installed, 'bank.withdraw')).toBe(false);
    expect(installAllowsTool(installed, 'bank.transfer')).toBe(false);

    expect(evaluateInstallToolCall(installed, 'trade.order')).toMatchObject({
      allowed: false,
      code: 'agents.tool_not_declared',
    });
    expect(evaluateInstallToolCall(installed, 'bank.withdraw')).toMatchObject({
      allowed: false,
      code: 'agents.tool_not_declared',
    });
  });

  it('does not copy claims onto the install guardrail', () => {
    const g = guardrailFromInstall(installMarketplaceRelease(HOSTILE));
    expect(g.tools).toEqual([]);
    expect(g.scopes).toEqual([]);
    expect(g.capacityMode).toBeUndefined();
    expect(g.limits.allowedModules).toEqual([]);
  });

  it('issues no withdrawal credential at install', () => {
    const installed = installMarketplaceRelease(HOSTILE);
    expect(credentialFromInstall(installed).scopes).toEqual([]);
    expect(installIssuedWithdraw(installed)).toBe(false);
  });

  it('door reports installed with place/withdraw locked false', () => {
    const door = marketplaceInstallDoor(HOSTILE);
    expect(door).toEqual({
      status: 'installed',
      packageId: 'hostile-bot',
      version: '9.9.9',
      publisher: 'untrusted-pub',
      claimedTools: [...HOSTILE.claimedTools],
      claimedScopes: [...HOSTILE.claimedScopes],
      grantCreated: false,
      tradingAuthority: false,
      withdrawCredentialIssued: false,
      callable: false,
      placeAllowed: false,
      withdrawAllowed: false,
    });
  });

  it('keeps the product-agent money denylist', () => {
    expect(isFleetHardMoneyWriteTool('trade.order')).toBe(true);
    expect(isFleetHardMoneyWriteTool('bank.withdraw')).toBe(true);
    expect(FLEET_HARD_MONEY_WRITE_TOOLS).toEqual(expect.arrayContaining(['trade.order', 'bank.withdraw', 'ledger.post']));
    for (const agentId of PRODUCT_AGENT_IDS) {
      expect(() =>
        parseGuardrail({
          agentId,
          version: 1,
          scopes: ['withdraw'],
          tools: [{ name: 'trade.order', module: 'trade', mode: 'write' }],
          limits: {
            maxActionsPerSession: 1,
            maxOutputTokensPerCall: 1,
            maxSpendPerSession: '0',
            allowedModules: ['trade'],
            allowedTasks: ['navigator.plan'],
          },
        }),
      ).toThrow(/cannot grant money-moving tool|cannot carry withdraw scope/);
    }
  });

  it('install source never upserts agent_definitions or copies claimed tools into parseGuardrail', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'install.ts'), 'utf8');
    expect(src).not.toMatch(/registerAgent/);
    expect(src).not.toMatch(/agent_definitions/);
    expect(src).toMatch(/tools:\s*\[\]/);
    expect(src).toMatch(/scopes:\s*\[\]/);
  });

  it('rejects empty package identity', () => {
    expect(() => installMarketplaceRelease({ packageId: ' ', version: '1', publisher: 'p' })).toThrow(/packageId/);
  });
});
