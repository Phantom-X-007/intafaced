/**
 * Unit card (L01 W6 A2 navigator residual / fleet):
 * Promise: hostile money-write tools refused by name on every Stage-1 factory
 *   (money-scope-honesty + parseGuardrail #1300 / #1339).
 * Break: a factory could declare ledger.post under a new agentId not in PRODUCT_AGENT_IDS.
 * Done bar: PRODUCT_AGENT_IDS == matrix agentIds; FLEET_HARD_MONEY_WRITE_TOOLS non-empty;
 *   every factory tool name outside the hard denylist; money-scope test file present.
 * Class: N
 */
import { describe, expect, it } from 'vitest';
import { FLEET_HARD_MONEY_WRITE_TOOLS, PRODUCT_AGENT_IDS, isFleetHardMoneyWriteTool, parseGuardrail } from './guardrails.js';
import { FLEET_PRODUCT_AGENTS } from './matrix.js';
import { navigatorAgentGuardrail } from '../navigator/guardrail.js';
import { supportAgentGuardrail } from '../support-agent/guardrail.js';
import { scannerAgentGuardrail } from '../scanner/guardrail.js';
import { merchantAgentGuardrail } from '../merchant/guardrail.js';
import { copyIntelAgentGuardrail } from '../copy-intel/guardrail.js';

const FACTORIES = [
  navigatorAgentGuardrail,
  supportAgentGuardrail,
  scannerAgentGuardrail,
  merchantAgentGuardrail,
  copyIntelAgentGuardrail,
] as const;

describe('hostile money tools refused on the whole Stage-1 fleet', () => {
  it('PRODUCT_AGENT_IDS matches the mount matrix exactly', () => {
    expect([...PRODUCT_AGENT_IDS].sort()).toEqual(FLEET_PRODUCT_AGENTS.map((r) => r.agentId).sort());
  });

  it('hard denylist covers ledger/pay/bank/trade/p2p write verbs', () => {
    expect(FLEET_HARD_MONEY_WRITE_TOOLS.length).toBeGreaterThanOrEqual(5);
    for (const need of [
      'ledger.post',
      'trade.order',
      'trade.place',
      'trade.amend',
      'trade.cancel',
      'bank.transfer',
      'bank.withdraw',
      'pay.route.change',
    ] as const) {
      expect(isFleetHardMoneyWriteTool(need), need).toBe(true);
    }
  });

  it('parseGuardrail refuses bank.withdraw on every product agentId', () => {
    for (const agentId of PRODUCT_AGENT_IDS) {
      expect(() =>
        parseGuardrail({
          agentId,
          version: 1,
          tools: [{ name: 'bank.withdraw', module: 'bank', mode: 'write' }],
          limits: {
            maxActionsPerSession: 1,
            maxOutputTokensPerCall: 64,
            maxSpendPerSession: '0',
            allowedModules: ['bank'],
            allowedTasks: ['navigator.plan'],
          },
        }),
      ).toThrow(/cannot grant money-moving tool/);
    }
  });

  it('no Stage-1 factory declares a hard money-write tool by name', () => {
    for (const factory of FACTORIES) {
      const g = factory();
      for (const t of g.tools) {
        expect(isFleetHardMoneyWriteTool(t.name), `${g.agentId} declares ${t.name}`).toBe(false);
      }
    }
  });

  it('parseGuardrail refuses injecting trade.place onto every product agentId', () => {
    for (const agentId of PRODUCT_AGENT_IDS) {
      expect(() =>
        parseGuardrail({
          agentId,
          version: 1,
          tools: [{ name: 'trade.place', module: 'trade', mode: 'write' }],
          limits: {
            maxActionsPerSession: 1,
            maxOutputTokensPerCall: 64,
            maxSpendPerSession: '0',
            allowedModules: ['trade'],
            allowedTasks: ['navigator.plan'],
          },
        }),
      ).toThrow(/cannot grant money-moving tool/);
    }
  });

  it('parseGuardrail refuses injecting trade.order onto every product agentId', () => {
    for (const agentId of PRODUCT_AGENT_IDS) {
      expect(() =>
        parseGuardrail({
          agentId,
          version: 1,
          tools: [{ name: 'trade.order', module: 'trade', mode: 'write' }],
          limits: {
            maxActionsPerSession: 1,
            maxOutputTokensPerCall: 64,
            maxSpendPerSession: '0',
            allowedModules: ['trade'],
            allowedTasks: ['navigator.plan'],
          },
        }),
      ).toThrow(/cannot grant money-moving tool/);
    }
  });
});
