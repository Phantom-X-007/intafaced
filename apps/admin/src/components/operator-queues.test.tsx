import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OperatorQueuesView, type OperatorQueuesViewProps } from './operator-queues';
import { isQueueStale, maskUserId, parseKycQueueRow, snapshotFromKycResponse, type KycQueueSnapshot } from '@/lib/operator-queue-contract';
import type { ToolListItem } from '@/lib/operator-tools-browser';

const receivedAt = new Date('2026-08-31T12:00:00.000Z');
const row = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  tier: 'full',
  jurisdiction: 'AT',
  status: 'pending',
  reviewedAt: null,
  expiresAt: null,
  createdAt: '2026-08-31T10:00:00.000Z',
} as const;

function tool(id: string, wire: 'wired' | 'not-wired' = 'wired'): ToolListItem {
  return {
    id,
    group: 'identity',
    label: id,
    summary: id,
    procedure: id.replace('identity.', ''),
    edgeModule: 'identity',
    kind: id.endsWith('pending') ? 'query' : 'mutation',
    authority: 'module',
    scope: 'admin:compliance',
    consequential: !id.endsWith('pending'),
    fields: [],
    wire,
    missing: wire === 'wired' ? [] : ['ADMIN_OPERATOR_TOKEN'],
    detail: wire === 'wired' ? null : 'ADMIN_OPERATOR_TOKEN is missing',
  };
}

function view(snapshot: KycQueueSnapshot, over: Partial<OperatorQueuesViewProps> = {}): OperatorQueuesViewProps {
  return {
    snapshot,
    kycTool: tool('identity.kyc.pending'),
    approveTool: tool('identity.kyc.approve'),
    rejectTool: tool('identity.kyc.reject'),
    filter: '',
    tier: 'all',
    sort: 'oldest',
    now: receivedAt,
    pending: false,
    onFilter: () => undefined,
    onTier: () => undefined,
    onSort: () => undefined,
    onLimit: () => undefined,
    onRefresh: () => undefined,
    onOpenTool: () => undefined,
    ...over,
  };
}

describe('operator queue contract', () => {
  it('validates rows and refuses malformed PII-bearing data', () => {
    expect(parseKycQueueRow(row)).toEqual(row);
    expect(parseKycQueueRow({ ...row, userId: 'not-a-uuid' })).toBeNull();
    expect(parseKycQueueRow({ ...row, jurisdiction: 'Austria' })).toBeNull();
    expect(parseKycQueueRow({ ...row, status: 'approved' })).toBeNull();
  });

  it('distinguishes partial, malformed, unauthorized, and unreachable responses', () => {
    const partial = snapshotFromKycResponse(
      {
        ok: true,
        delivered: true,
        status: 200,
        detail: null,
        data: [row, { bad: true }],
        toolId: 'identity.kyc.pending',
        procedure: 'kyc.pending',
        edgePath: '/kyc',
      },
      50,
      receivedAt,
    );
    expect(partial).toMatchObject({ kind: 'partial', rejectedRows: 1 });
    expect(
      snapshotFromKycResponse(
        { ok: true, delivered: true, status: 200, detail: null, data: {}, toolId: 'x', procedure: 'x', edgePath: '/x' },
        50,
        receivedAt,
      ),
    ).toMatchObject({ kind: 'failure', failure: 'malformed' });
    expect(
      snapshotFromKycResponse(
        { ok: false, delivered: true, status: 403, detail: 'forbidden', data: null, toolId: 'x', procedure: 'x', edgePath: '/x' },
        50,
        receivedAt,
      ),
    ).toMatchObject({ kind: 'failure', failure: 'unauthorized' });
    expect(
      snapshotFromKycResponse(
        { ok: false, delivered: false, status: 502, detail: 'offline', data: null, toolId: 'x', procedure: 'x', edgePath: null },
        50,
        receivedAt,
      ),
    ).toMatchObject({ kind: 'failure', failure: 'unreachable' });
  });

  it('masks user ids and marks old snapshots stale', () => {
    expect(maskUserId(row.userId)).toBe('22222222…2222');
    expect(isQueueStale(receivedAt.toISOString(), new Date('2026-08-31T12:00:59.999Z'))).toBe(false);
    expect(isQueueStale(receivedAt.toISOString(), new Date('2026-08-31T12:01:00.000Z'))).toBe(true);
  });
});

describe('OperatorQueuesView honesty and accessibility', () => {
  it('renders an accessible live table with masked PII, freshness, and deep links', () => {
    const html = renderToStaticMarkup(
      <OperatorQueuesView
        {...view({ kind: 'live', rows: [row], rejectedRows: 0, requestedLimit: 50, receivedAt: receivedAt.toISOString() })}
      />,
    );
    expect(html).toContain('<caption');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain('href="#kyc-11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('22222222…2222');
    expect(html).not.toContain(row.userId);
    expect(html).toContain('total and next page unavailable');
    expect(html).toContain('Unavailable lanes · no queue mounted');
    expect(html).toContain('NOT MOUNTED');
    expect(html).toContain('These are contract gaps, not empty work queues');
    expect(html).toContain('Surveillance cases');
    expect(html).toContain('No admin case UI is mounted');
    expect(html).not.toContain('empty case list</');
    expect(html).not.toContain('No inspectable target set');
  });

  it('disables row actions when mutation wiring is unavailable', () => {
    const html = renderToStaticMarkup(
      <OperatorQueuesView
        {...view(
          { kind: 'live', rows: [row], rejectedRows: 0, requestedLimit: 50, receivedAt: receivedAt.toISOString() },
          { approveTool: tool('identity.kyc.approve', 'not-wired'), rejectTool: tool('identity.kyc.reject', 'not-wired') },
        )}
      />,
    );
    expect(html).toContain('Approval unavailable');
    expect(html).toContain('Rejection unavailable');
    expect(html).toMatch(/Approval unavailable<\/button>/);
  });

  it('renders empty, partial, unavailable, and failed states without synthetic rows', () => {
    const states: KycQueueSnapshot[] = [
      { kind: 'empty', rows: [], rejectedRows: 0, requestedLimit: 50, receivedAt: receivedAt.toISOString() },
      { kind: 'partial', rows: [row], rejectedRows: 2, requestedLimit: 50, receivedAt: receivedAt.toISOString() },
      { kind: 'unavailable', reason: 'token missing', missing: ['ADMIN_OPERATOR_TOKEN'], requestedLimit: 50 },
      { kind: 'failure', failure: 'refused', detail: 'bad request', requestedLimit: 50, receivedAt: receivedAt.toISOString() },
    ];
    const html = states.map((state) => renderToStaticMarkup(<OperatorQueuesView {...view(state)} />)).join('\n');
    expect(html).toContain('empty pending queue');
    expect(html).toContain('2 malformed rows were refused');
    expect(html).toContain('token missing');
    expect(html).toContain('refused: bad request');
  });
});
