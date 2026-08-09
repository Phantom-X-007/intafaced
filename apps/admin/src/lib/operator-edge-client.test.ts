import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coerceToolInput, invokeOperatorTool, listToolWireStates, wireStateFor } from './operator-edge-client';
import { OPERATOR_TOOLS, toolById } from './operator-tools-catalog';

/**
 * Operator tools must never green-success from local-only state.
 * Either a real edge request went out with the right credential, or the
 * result is an explicit not-wired / refuse.
 */

const EDGE = 'http://edge:4000';
const OPERATOR = 'operator-token-value';
const TREASURY = 'treasury-token-value';
const ORIGINAL = { ...process.env };

const forbiddenFetch = vi.fn(() => {
  throw new Error('fetch was called on a console that is not configured to call anything');
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  for (const key of ['EDGE_URL', 'ADMIN_OPERATOR_TOKEN', 'ADMIN_TREASURY_TOKEN', 'ADMIN_BFF_SHARED_SECRET']) {
    delete process.env[key];
  }
  vi.restoreAllMocks();
  forbiddenFetch.mockClear();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('catalog inventory', () => {
  it('lists the mounted operator surfaces named in the unit card', () => {
    const ids = OPERATOR_TOOLS.map((t) => t.id);
    expect(ids).toContain('identity.kyc.pending');
    expect(ids).toContain('identity.kyc.approve');
    expect(ids).toContain('identity.kyc.reject');
    expect(ids).toContain('identity.compliance.freezeIdentity');
    expect(ids).toContain('bank.ops.runDueTransfers');
    expect(ids).toContain('pay.merchantState.set');
    expect(ids).toContain('pay.deposit.credit');
    expect(ids).toContain('token.mintEpoch');
    expect(ids).toContain('academy.appointAmbassador');
    // Reconcile is NOT in this catalog — it stays simulated on /ledger.
    expect(ids.some((id) => id.includes('reconcile') && id.includes('ledger'))).toBe(false);
  });
});

describe('not-wired when env missing', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', forbiddenFetch);
  });

  it('marks every tool not-wired without EDGE_URL', () => {
    const states = listToolWireStates(OPERATOR_TOOLS);
    expect(states.every((s) => s.wire === 'not-wired')).toBe(true);
    expect(states[0]!.missing).toContain('EDGE_URL');
  });

  it('treasury tools name ADMIN_TREASURY_TOKEN when only operator token is set', () => {
    process.env.EDGE_URL = EDGE;
    process.env.ADMIN_OPERATOR_TOKEN = OPERATOR;
    const mint = toolById('token.mintEpoch')!;
    const state = wireStateFor(mint);
    expect(state.wire).toBe('not-wired');
    expect(state.missing).toEqual(['ADMIN_TREASURY_TOKEN']);
    expect(state.detail).toContain('ADMIN_TREASURY_TOKEN');
  });

  it('invoke answers 503 and does not call fetch when unconfigured', async () => {
    const result = await invokeOperatorTool('pay.deposit.credit', {
      userId: '11111111-1111-4111-8111-111111111111',
      assetId: 'USDT',
      amount: '1.00',
      railId: 'rail',
      railRef: 'ref-1',
    });
    expect(forbiddenFetch).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.delivered).toBe(false);
    expect(result.data).toMatchObject({ wire: 'not-wired' });
  });
});

describe('wired invoke forwards to edge with the right authority', () => {
  it('posts deposit.credit with the treasury token', async () => {
    process.env.EDGE_URL = EDGE;
    process.env.ADMIN_TREASURY_TOKEN = TREASURY;
    process.env.ADMIN_OPERATOR_TOKEN = OPERATOR;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${EDGE}/api/pay/trpc/deposit.credit`);
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TREASURY}`);
      return jsonResponse({ result: { data: { json: { id: 'dep-1' } } } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeOperatorTool('pay.deposit.credit', {
      userId: '11111111-1111-4111-8111-111111111111',
      assetId: 'USDT',
      amount: '1.00',
      railId: 'rail',
      railRef: 'ref-1',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    expect(result.delivered).toBe(true);
    expect(result.data).toEqual({ id: 'dep-1' });
  });

  it('GETs kyc.pending with the operator token', async () => {
    process.env.EDGE_URL = EDGE;
    process.env.ADMIN_OPERATOR_TOKEN = OPERATOR;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain(`${EDGE}/api/identity/trpc/kyc.pending`);
      expect(init?.method).toBe('GET');
      expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${OPERATOR}`);
      return jsonResponse({ result: { data: { json: [] } } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeOperatorTool('identity.kyc.pending', { limit: '25' });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('passes through edge refuse as failure, not local success', async () => {
    process.env.EDGE_URL = EDGE;
    process.env.ADMIN_OPERATOR_TOKEN = OPERATOR;

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'Missing scope admin:compliance', code: 'FORBIDDEN' } }, 403)),
    );

    const result = await invokeOperatorTool('identity.kyc.approve', {
      recordId: '22222222-2222-4222-8222-222222222222',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.delivered).toBe(true);
    expect(result.detail).toMatch(/admin:compliance|FORBIDDEN/i);
  });
});

describe('coerceToolInput', () => {
  it('requires recordId on kyc.approve', () => {
    const tool = toolById('identity.kyc.approve')!;
    expect(coerceToolInput(tool, {})).toEqual({ error: 'recordId is required' });
  });

  it('parses sources JSON for distributeRevenue', () => {
    const tool = toolById('token.distributeRevenue')!;
    const out = coerceToolInput(tool, {
      windowId: 'w1',
      sources: '[{"module":"trade","amount":"10.00"}]',
    });
    expect(out).toEqual({
      input: { windowId: 'w1', sources: [{ module: 'trade', amount: '10.00' }] },
    });
  });
});
