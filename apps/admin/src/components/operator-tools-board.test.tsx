import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperatorToolsView, type OperatorToolsViewProps } from './operator-tools-board';
import type { ToolListItem, ToolListResponse } from '@/lib/operator-tools-browser';

const notWiredKyc: ToolListItem = {
  id: 'identity.kyc.pending',
  group: 'identity',
  label: 'KYC pending queue',
  summary: 'List KYC records waiting for an operator decision.',
  procedure: 'kyc.pending',
  edgeModule: 'identity',
  kind: 'query',
  authority: 'module',
  scope: 'admin:compliance',
  consequential: false,
  fields: [],
  wire: 'not-wired',
  missing: ['EDGE_URL', 'ADMIN_OPERATOR_TOKEN'],
  detail: 'This console cannot halt a module — EDGE_URL and ADMIN_OPERATOR_TOKEN are not set on this app.',
};

const catalog: ToolListResponse = {
  edgeUrl: null,
  moduleConfigured: false,
  treasuryConfigured: false,
  tools: [notWiredKyc],
  residual: {
    reconcile: 'simulated — svc-edge has no reconcile route; see /ledger',
    sso: 'Class X — console has no operator SSO',
  },
};

function base(over: Partial<OperatorToolsViewProps> = {}): OperatorToolsViewProps {
  return {
    catalog,
    selected: notWiredKyc,
    fieldValues: {},
    acknowledged: false,
    result: null,
    pending: false,
    wiredCount: 0,
    notWiredCount: 1,
    onSelect: () => undefined,
    onField: () => undefined,
    onAcknowledge: () => undefined,
    onRun: () => undefined,
    onRefresh: () => undefined,
    ...over,
  };
}

describe('OperatorToolsView honesty', () => {
  it('renders not-wired banner and names missing vars', () => {
    const html = renderToStaticMarkup(<OperatorToolsView {...base()} />);
    expect(html).toContain('not-wired');
    expect(html).toContain('EDGE_URL');
    expect(html).toContain('ADMIN_OPERATOR_TOKEN');
    expect(html).toContain('tool-not-wired');
    expect(html).toMatch(/Disabled —/);
  });

  it('shows residual reconcile as simulated', () => {
    const html = renderToStaticMarkup(<OperatorToolsView {...base()} />);
    expect(html).toMatch(/simulated/i);
    expect(html).toMatch(/reconcile/i);
  });

  it('does not claim success when result is a refuse', () => {
    const html = renderToStaticMarkup(
      <OperatorToolsView
        {...base()}
        result={{
          ok: false,
          status: 503,
          detail: 'EDGE_URL is not set',
          delivered: false,
          data: { wire: 'not-wired' },
          toolId: 'identity.kyc.pending',
          procedure: 'kyc.pending',
          edgePath: '/api/identity/trpc/kyc.pending',
        }}
      />,
    );
    expect(html).toContain('Not applied as success');
    expect(html).toContain('not delivered');
    expect(html).not.toMatch(/>ok</);
  });
});
