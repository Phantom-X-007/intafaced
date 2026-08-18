'use client';

import { useMemo, useState, useTransition } from 'react';
import { Panel } from '@intafaced/ui';
import { Chip } from '@/components/chip';
import {
  fetchOperatorTools,
  invokeOperatorToolBrowser,
  type InvokeResponse,
  type ToolListItem,
  type ToolListResponse,
} from '@/lib/operator-tools-browser';
import { TOOL_GROUPS } from '@/lib/operator-tools-catalog';

/**
 * Operator tools board — lists mounted procedures and invokes via BFF.
 *
 * Rules:
 * 1. not-wired tools never look live; missing env var is named at the control.
 * 2. A failed invoke never advances local "success" state — only the response.
 * 3. Consequential tools require an explicit acknowledge before POST.
 */

export interface OperatorToolsBoardProps {
  initial: ToolListResponse;
}

export function OperatorToolsBoard({ initial }: OperatorToolsBoardProps) {
  const [catalog, setCatalog] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial.tools[0]?.id ?? null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<InvokeResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(() => catalog.tools.find((t) => t.id === selectedId) ?? null, [catalog.tools, selectedId]);

  function selectTool(id: string) {
    setSelectedId(id);
    setFieldValues({});
    setAcknowledged(false);
    setResult(null);
  }

  function refresh() {
    startTransition(async () => {
      const next = await fetchOperatorTools();
      setCatalog(next);
    });
  }

  function run() {
    if (!selected) return;
    if (selected.wire === 'not-wired') return;
    if (selected.consequential && !acknowledged) return;

    const input: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fieldValues)) {
      if (v.trim() !== '') input[k] = v;
    }

    startTransition(async () => {
      const res = await invokeOperatorToolBrowser(selected.id, input);
      setResult(res);
      // Never invent success for a consequential tool that did not deliver.
      if (res.ok && res.delivered) setAcknowledged(false);
    });
  }

  const wiredCount = catalog.tools.filter((t) => t.wire === 'wired').length;
  const notWiredCount = catalog.tools.length - wiredCount;

  return (
    <OperatorToolsView
      catalog={catalog}
      selected={selected}
      fieldValues={fieldValues}
      acknowledged={acknowledged}
      result={result}
      pending={isPending}
      wiredCount={wiredCount}
      notWiredCount={notWiredCount}
      onSelect={selectTool}
      onField={(name, value) => setFieldValues((prev) => ({ ...prev, [name]: value }))}
      onAcknowledge={setAcknowledged}
      onRun={run}
      onRefresh={refresh}
    />
  );
}

// ── Pure view (testable via renderToStaticMarkup) ────────────────────────────

export interface OperatorToolsViewProps {
  catalog: ToolListResponse;
  selected: ToolListItem | null;
  fieldValues: Record<string, string>;
  acknowledged: boolean;
  result: InvokeResponse | null;
  pending: boolean;
  wiredCount: number;
  notWiredCount: number;
  onSelect: (id: string) => void;
  onField: (name: string, value: string) => void;
  onAcknowledge: (v: boolean) => void;
  onRun: () => void;
  onRefresh: () => void;
}

export function OperatorToolsView(props: OperatorToolsViewProps) {
  const { catalog, selected, result } = props;
  const canRun = selected != null && selected.wire === 'wired' && !props.pending && (!selected.consequential || props.acknowledged);

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1>Operator tools</h1>
          <p>
            Procedures already mounted on svc-edge under <code>/api/*/trpc/*</code>. This console proxies with the server-side operator or
            treasury token. Missing env → <strong>not-wired</strong>, never a local green success for money or compliance mutations. Ledger
            reconcile stays simulated on <code>/ledger</code>.
          </p>
        </div>
        <button type="button" className="adm-btn" onClick={props.onRefresh} disabled={props.pending}>
          Refresh wire status
        </button>
      </div>

      <div className="adm-callout" data-tone={props.notWiredCount === 0 ? 'info' : 'warn'}>
        <strong>
          {props.wiredCount} wired · {props.notWiredCount} not-wired
        </strong>
        {catalog.edgeUrl ? (
          <>
            {' '}
            Edge <code>{catalog.edgeUrl}</code>. Module token{' '}
            <Chip tone={catalog.moduleConfigured ? 'live' : 'warn'}>{catalog.moduleConfigured ? 'set' : 'missing'}</Chip> · Treasury token{' '}
            <Chip tone={catalog.treasuryConfigured ? 'live' : 'warn'}>{catalog.treasuryConfigured ? 'set' : 'missing'}</Chip>
          </>
        ) : (
          <>
            {' '}
            <code>EDGE_URL</code> is not set on this console — every tool below is inert.
          </>
        )}
        {catalog.error && <> Load error: {catalog.error}</>}
      </div>

      {catalog.residual && (
        <p className="adm-footnote">
          Residual: {catalog.residual.reconcile}. {catalog.residual.sso}.
        </p>
      )}

      <div className="adm-split adm-split--tools">
        <div className="adm-stack">
          {TOOL_GROUPS.map((group) => {
            const tools = catalog.tools.filter((t) => t.group === group.id);
            if (tools.length === 0) return null;
            return (
              <Panel key={group.id} title={group.label}>
                <ul className="adm-tool-list">
                  {tools.map((tool) => {
                    const active = selected?.id === tool.id;
                    return (
                      <li key={tool.id}>
                        <button
                          type="button"
                          className="adm-tool-row"
                          data-active={active ? 'true' : undefined}
                          data-wire={tool.wire}
                          onClick={() => props.onSelect(tool.id)}
                        >
                          <span className="adm-tool-row__label">{tool.label}</span>
                          <span className="adm-tool-row__meta">
                            <Chip tone={tool.wire === 'wired' ? 'live' : 'warn'}>{tool.wire}</Chip>
                            {tool.consequential && <Chip tone="danger">consequential</Chip>}
                            <code>{tool.procedure}</code>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            );
          })}
        </div>

        <div className="adm-stack">
          {selected ? (
            <Panel
              title={selected.label}
              actions={
                <>
                  <Chip tone={selected.wire === 'wired' ? 'live' : 'warn'}>{selected.wire}</Chip>
                  <Chip tone="info">{selected.scope}</Chip>
                </>
              }
            >
              <div className="adm-stack">
                <p className="adm-footnote">{selected.summary}</p>
                <p className="adm-footnote">
                  Edge path:{' '}
                  <code>
                    /api/{selected.edgeModule}/trpc/{selected.procedure}
                  </code>{' '}
                  · {selected.kind} · authority {selected.authority}
                </p>

                {selected.wire === 'not-wired' && (
                  <div className="adm-callout" data-tone="warn" data-testid="tool-not-wired">
                    <strong>Not wired</strong>
                    {selected.detail ?? 'Missing configuration.'} Set{' '}
                    {selected.missing.map((name, i) => (
                      <span key={name}>
                        {i > 0 && ' + '}
                        <code>{name}</code>
                      </span>
                    ))}
                    . This button will not claim success without a network call.
                  </div>
                )}

                {selected.fields.map((field) => (
                  <div key={field.name} className="adm-field">
                    <label htmlFor={`tool-field-${field.name}`}>
                      {field.label}
                      {field.required ? ' *' : ''}
                    </label>
                    {field.type === 'enum' && field.enumValues ? (
                      <select
                        id={`tool-field-${field.name}`}
                        className="adm-input"
                        value={props.fieldValues[field.name] ?? ''}
                        disabled={selected.wire === 'not-wired' || props.pending}
                        onChange={(e) => props.onField(field.name, e.target.value)}
                      >
                        <option value="">—</option>
                        {field.enumValues.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'json' ? (
                      <textarea
                        id={`tool-field-${field.name}`}
                        className="adm-textarea"
                        rows={4}
                        value={props.fieldValues[field.name] ?? ''}
                        placeholder={field.placeholder}
                        disabled={selected.wire === 'not-wired' || props.pending}
                        onChange={(e) => props.onField(field.name, e.target.value)}
                      />
                    ) : (
                      <input
                        id={`tool-field-${field.name}`}
                        className="adm-input"
                        value={props.fieldValues[field.name] ?? ''}
                        placeholder={field.placeholder}
                        disabled={selected.wire === 'not-wired' || props.pending}
                        onChange={(e) => props.onField(field.name, e.target.value)}
                      />
                    )}
                    {field.hint && <span className="adm-footnote">{field.hint}</span>}
                  </div>
                ))}

                {selected.consequential && selected.wire === 'wired' && (
                  <label className="adm-check">
                    <input
                      type="checkbox"
                      checked={props.acknowledged}
                      disabled={props.pending}
                      onChange={(e) => props.onAcknowledge(e.target.checked)}
                    />
                    <span>I understand this calls the live platform ({selected.scope}) and is not a browser-local preview.</span>
                  </label>
                )}

                <div className="adm-actions">
                  <button type="button" className="adm-btn adm-btn--primary" disabled={!canRun} onClick={props.onRun}>
                    {props.pending ? 'Calling edge…' : selected.kind === 'query' ? 'Run query' : 'Invoke'}
                  </button>
                  {selected.wire === 'not-wired' && (
                    <span className="adm-blocked">Disabled — {selected.missing.join(' and ')} not set on this console.</span>
                  )}
                </div>
              </div>
            </Panel>
          ) : (
            <Panel title="Select a tool">
              <p className="adm-footnote">Choose a procedure from the list.</p>
            </Panel>
          )}

          {result && (
            <Panel
              title={result.ok ? 'Edge response' : 'Refused / failed'}
              actions={
                <>
                  <Chip tone={result.ok ? 'live' : 'danger'}>{result.ok ? 'ok' : 'error'}</Chip>
                  <Chip tone={result.delivered ? 'info' : 'warn'}>{result.delivered ? 'delivered' : 'not delivered'}</Chip>
                  <Chip tone="neutral">HTTP {result.status}</Chip>
                </>
              }
            >
              <div className="adm-stack">
                {!result.ok && result.detail && (
                  <div className="adm-callout" data-tone="danger">
                    <strong>Not applied as success</strong>
                    {result.detail}
                  </div>
                )}
                {result.edgePath && (
                  <p className="adm-footnote">
                    Called <code>{result.edgePath}</code> ({result.procedure})
                  </p>
                )}
                <pre className="adm-pre">{JSON.stringify(result.data, null, 2)}</pre>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
