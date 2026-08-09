import { OperatorToolsBoard } from '@/components/operator-tools-board';
import { listToolWireStates } from '@/lib/operator-edge-client';
import { OPERATOR_TOOLS } from '@/lib/operator-tools-catalog';
import { readConsoleStatus } from '@/lib/console-status';
import type { ToolListResponse } from '@/lib/operator-tools-browser';

/**
 * Operator tools — UI for procedures already reachable via edge `/api/*` tRPC
 * with an admin-scoped token. No new service work; not-wired when env missing.
 */
export default function OperatorToolsPage() {
  const status = readConsoleStatus();
  const wires = listToolWireStates(OPERATOR_TOOLS);

  const initial: ToolListResponse = {
    edgeUrl: status.edgeUrl,
    moduleConfigured: status.module.configured,
    treasuryConfigured: status.treasury.configured,
    tools: OPERATOR_TOOLS.map((tool, i) => {
      const w = wires[i]!;
      return {
        id: tool.id,
        group: tool.group,
        label: tool.label,
        summary: tool.summary,
        procedure: tool.procedure,
        edgeModule: tool.edgeModule,
        kind: tool.kind,
        authority: tool.authority,
        scope: tool.scope,
        consequential: tool.consequential,
        fields: tool.fields,
        wire: w.wire,
        missing: w.missing,
        detail: w.detail,
      };
    }),
    residual: {
      reconcile: 'simulated — svc-edge has no reconcile route; see /ledger',
      sso: 'Class X — console has no operator SSO; BFF secret optional until then',
    },
  };

  return <OperatorToolsBoard initial={initial} />;
}
