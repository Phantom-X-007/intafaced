'use client';

import { useMemo, useState, useTransition } from 'react';
import { Panel, StatBlock } from '@intafaced/ui';
import type { Drop, ModuleId } from '@intafaced/config';
import { Chip } from '@/components/chip';
import { dropLabel } from '@/lib/drops';
import { type ControlPlaneState, type KillSwitchSnapshot, postKillSwitch } from '@/lib/control-plane-browser';
import {
  CRITICAL_FLAG_KEY,
  PROVENANCE_LABEL,
  diffStates,
  flagStates,
  groupByModule,
  isCritical,
  isEdgePerimeterModule,
  modulesWithoutKillSwitch,
  type FlagState,
} from '@/lib/flag-state';

/**
 * KILL-SWITCH BOARD — §14.6 "Admin controls: kill-switch + config surface".
 *
 * Two kinds of switch on one board, and telling them apart is the whole job:
 *
 *   · MODULE rows are LIVE against svc-edge when the control plane is reachable
 *     (#186 / A-P5-OPS), and disabled — with the reason — when it is not.
 *   · FLAG rows are a session preview of what an override WOULD do. There is no
 *     durable flag store yet (§13), so flipping one changes this browser tab and
 *     nothing else, for ever, no matter how the console is configured.
 *
 * The second fact used to be stated in a footnote that appeared only AFTER a
 * flag had been flipped, and on the `ledger.posting` panel — the switch labelled
 * "halts ALL value movement platform-wide" — not at all. So the most dangerous
 * control on the board was also the one whose inertness was hardest to discover.
 * Every preview control now carries the word at the control.
 */

export interface KillSwitchBoardProps {
  drop: Drop;
  flagEnv: Record<string, string>;
  /** Server-loaded snapshot so first paint matches the edge. */
  initialControlPlane: ControlPlaneState;
}

export function KillSwitchBoard({ drop, flagEnv, initialControlPlane }: KillSwitchBoardProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [plane, setPlane] = useState(initialControlPlane);
  const [pendingModule, setPendingModule] = useState<ModuleId | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [criticalArmed, setCriticalArmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const disabledModules = plane.snapshot.disabledModules as ModuleId[];
  const liveModules = plane.status === 'reachable';

  const baseline = useMemo(() => flagStates({ drop, env: flagEnv }), [drop, flagEnv]);
  const staged = useMemo(() => flagStates({ drop, env: flagEnv, overrides, disabledModules }), [drop, flagEnv, overrides, disabledModules]);

  const groups = useMemo(() => groupByModule(staged, disabledModules), [staged, disabledModules]);
  const changes = useMemo(() => diffStates(baseline, staged), [baseline, staged]);
  const uncovered = useMemo(() => modulesWithoutKillSwitch(), []);

  const liveCount = staged.filter((s) => s.enabled).length;
  const offClockCount = staged.filter((s) => s.def.drop === null).length;
  const critical = staged.find((s) => s.def.key === CRITICAL_FLAG_KEY);

  function setFlag(key: string, value: boolean) {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  }

  function clearFlag(key: string) {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function requestModuleToggle(module: ModuleId) {
    if (!liveModules) return;
    setPendingModule(module);
    setReason('');
    setActionError(null);
  }

  function applyModuleToggle() {
    if (!pendingModule) return;
    const trimmed = reason.trim();
    if (trimmed.length < 12) {
      setActionError('Reason must be at least 12 characters — an outage nobody can explain is worse.');
      return;
    }

    const nextDisabled = !disabledModules.includes(pendingModule);
    startTransition(async () => {
      const result = await postKillSwitch({ module: pendingModule, disabled: nextDisabled, reason: trimmed });
      if (!result.ok) {
        setActionError(result.detail ?? `kill-switch refused (${result.status})`);
        return;
      }
      setPlane({ status: 'reachable', snapshot: result.snapshot, detail: null });
      setPendingModule(null);
      setReason('');
      setActionError(null);
    });
  }

  function reset() {
    setOverrides({});
    setCriticalArmed(false);
    setPendingModule(null);
    setReason('');
    setActionError(null);
  }

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1>Kill-switches</h1>
          <p>
            {FLAG_COUNT_COPY} Resolution runs through the same <code>resolveAll()</code> the services call, at the drop reported in the
            header — {dropLabel(drop)}. A <strong>module</strong> kill is live on svc-edge when the control plane is reachable; per-flag
            overrides stay session-staged until the flag store lands.
          </p>
        </div>
        <div className="adm-inline">
          <button type="button" className="adm-btn" onClick={reset} disabled={changes.length === 0 && !pendingModule}>
            Reset staged flags
          </button>
        </div>
      </div>

      <ControlPlanePanel plane={plane} />

      <Panel title="Platform state" live>
        <div className="adm-statrow">
          <StatBlock label="Flags live" value={`${liveCount} / ${staged.length}`} />
          <StatBlock label="Off the drop clock" value={offClockCount} deltaLabel="never on by default" />
          <StatBlock label="Modules killed (live)" value={disabledModules.length} />
          <StatBlock label="Staged flag changes" value={changes.length} />
          <StatBlock label="Env overrides" value={Object.keys(flagEnv).length} deltaLabel="INTAFACED_FLAG_*" />
        </div>
      </Panel>

      {pendingModule && (
        <Panel
          title={`Confirm module ${disabledModules.includes(pendingModule) ? 're-enable' : 'kill'}: ${pendingModule}`}
          className="adm-panel--warn"
        >
          <div className="adm-stack">
            <p className="adm-footnote">
              This hits <code>POST /api/kill-switch</code> → svc-edge. Cancels and reads still pass; new commitments on this module refuse
              with 503. Reason is required on the edge (≥ 12 characters).
            </p>
            <label className="adm-stack">
              <span className="adm-meta">Reason</span>
              <textarea
                className="adm-textarea"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. incident: halt new trade risk while investigating fill anomaly"
                disabled={isPending}
              />
            </label>
            {actionError && (
              <div className="adm-callout" data-tone="danger">
                <strong>Not applied</strong>
                {actionError}
              </div>
            )}
            <div className="adm-inline">
              <button type="button" className="adm-btn" data-tone="danger" onClick={applyModuleToggle} disabled={isPending}>
                {isPending ? 'Sending…' : disabledModules.includes(pendingModule) ? 'Re-enable module' : 'Kill module now'}
              </button>
              <button
                type="button"
                className="adm-btn"
                onClick={() => {
                  setPendingModule(null);
                  setActionError(null);
                }}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
          </div>
        </Panel>
      )}

      {critical && <CriticalSwitch state={critical} armed={criticalArmed} onArm={setCriticalArmed} onSet={setFlag} onClear={clearFlag} />}

      {changes.length > 0 && (
        <Panel title={`Staged — ${changes.length} flag${changes.length === 1 ? '' : 's'} would change`} className="adm-panel--warn">
          <div className="adm-stack">
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Flag</th>
                    <th>Now</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((change) => (
                    <tr key={change.key} data-critical={isCritical(change.key)}>
                      <td className="adm-key">{change.key}</td>
                      <td>
                        <StateChip on={change.from} />
                      </td>
                      <td>
                        <StateChip on={change.to} critical={isCritical(change.key) && !change.to} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="adm-footnote">{stageNotice}</p>
          </div>
        </Panel>
      )}

      {plane.snapshot.audit.length > 0 && (
        <Panel title="Live kill-switch audit (newest first)">
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Module</th>
                  <th>Actor</th>
                  <th>Change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {plane.snapshot.audit.slice(0, 12).map((entry, i) => (
                  <tr key={`${entry.at}-${entry.module}-${i}`}>
                    <td className="adm-meta">{entry.at}</td>
                    <td className="adm-key">{entry.module}</td>
                    <td className="adm-meta">{entry.actor}</td>
                    <td>
                      {entry.previous ? 'killed' : 'live'} → {entry.next ? 'killed' : 'live'}
                      {!entry.changed && <span className="adm-meta"> (no-op)</span>}
                    </td>
                    <td className="adm-desc">{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel
        title="Flags by module"
        actions={
          <Chip tone="warn" dot>
            Flag switches: preview only
          </Chip>
        }
      >
        <div className="adm-callout" data-tone="warn">
          <strong>The per-flag switches in this table change nothing outside this browser tab</strong>
          {stageNotice}
        </div>
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Description</th>
                <th>Drop</th>
                <th>State</th>
                <th>Decided by</th>
                <th>Switch — preview only</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.module}>
                <tr>
                  <td className="adm-subhead" colSpan={6}>
                    <span className="adm-subhead__row">
                      <span>{group.module}</span>
                      <span className="adm-meta">
                        {group.service} · phase {group.phase} · {group.planes.join(' + ')}
                      </span>
                      {group.custodial ? <Chip tone="warn">Custodial</Chip> : <Chip tone="info">Non-custodial</Chip>}
                      <Chip tone={group.flags.some((f) => f.enabled) ? 'live' : 'dark'}>
                        {group.flags.filter((f) => f.enabled).length} / {group.flags.length} live
                      </Chip>
                      <span className="adm-topbar__spacer" />
                      {group.killed && <Chip tone="danger">Module killed</Chip>}
                      {isEdgePerimeterModule(group.module) ? (
                        <Chip tone="live">Edge perimeter</Chip>
                      ) : (
                        <Chip tone="warn">Not edge-enforced</Chip>
                      )}
                      {liveModules ? <Chip tone="live">Live switch</Chip> : <Chip tone="danger">Inert — {plane.status}</Chip>}
                      <Switch
                        on={!group.killed}
                        onLabel="Enabled"
                        offLabel="Killed"
                        disabled={!liveModules || isPending}
                        // The reason travels with the control. A disabled switch
                        // with no explanation reads as a broken console.
                        title={liveModules ? undefined : (plane.detail ?? `control plane ${plane.status}`)}
                        onToggle={() => requestModuleToggle(group.module)}
                      />
                    </span>
                  </td>
                </tr>

                {group.flags.map((state) => (
                  <FlagRow
                    key={state.def.key}
                    state={state}
                    moduleKilled={group.killed}
                    criticalArmed={criticalArmed}
                    onSet={setFlag}
                    onClear={clearFlag}
                  />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>

      <Panel title="Modules with no kill-switch" className="adm-panel--warn">
        {uncovered.length === 0 ? (
          <p className="adm-footnote">Every module in the registry declares at least one flag.</p>
        ) : (
          <div className="adm-stack">
            <div className="adm-callout" data-tone="warn">
              <strong>{uncovered.length} module(s) cannot satisfy §14.6 as written</strong>
              These module ids appear in <code>MODULES</code> but in no entry of <code>FLAG_REGISTRY</code>, so there is nothing for an
              operator to switch off. <code>tooling/ci/dod-gate.mjs</code> fails a service on exactly this condition, so each of these is a
              blocked Definition of Done the day its service lands.
            </div>
            <div className="adm-inline">
              {uncovered.map((id) => (
                <Chip key={id} tone="warn">
                  {id}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

function ControlPlanePanel({ plane }: { plane: ControlPlaneState }) {
  const tone = plane.status === 'reachable' ? 'info' : plane.status === 'unconfigured' ? 'warn' : 'danger';
  const title =
    plane.status === 'reachable'
      ? 'Control plane: reachable'
      : plane.status === 'unconfigured'
        ? 'Control plane: not configured'
        : 'Control plane: unreachable';

  return (
    <Panel title={title} className={plane.status === 'reachable' ? undefined : 'adm-panel--warn'}>
      <div className="adm-stack">
        <div className="adm-callout" data-tone={tone}>
          <strong>{plane.status}</strong>
          {plane.status === 'reachable' && (
            <>
              Module kills hit svc-edge. Only <b>perimeter</b> modules (trade, pay, identity, …) stop new <code>/api/*</code> traffic.
              Killing <code>ws</code>/<code>matching</code>/<code>ledger</code> is audited but not process-enforced. Live killed:{' '}
              <b>{(plane.snapshot as KillSwitchSnapshot).disabledModules.length}</b>. No console SSO — deployment tokens only; do not expose
              admin without ACL. Per-flag staging stays local.
            </>
          )}
          {plane.status === 'unconfigured' && (
            <>
              {/* `detail` names the variable that is ACTUALLY missing. The old
                  copy always said "set EDGE_URL and ADMIN_OPERATOR_TOKEN", which
                  sends an operator to check a setting that was already right. */}
              {plane.detail ?? 'This console holds no credential for the control plane.'} Module switches stay disabled until the console
              can reach the edge — a local flip that looks like a halt is worse than no switch.
            </>
          )}
          {plane.status === 'unreachable' && (
            <>
              {plane.detail ?? 'svc-edge did not answer or refused the operator token.'} Module switches stay disabled until the plane is
              reachable again.
            </>
          )}
        </div>
        {plane.detail && plane.status === 'reachable' && <p className="adm-footnote">{plane.detail}</p>}
        <p className="adm-footnote">
          Operator runbook: <code>docs/OPS-KILL-SWITCH-RUNBOOK.md</code>
        </p>
      </div>
    </Panel>
  );
}

const FLAG_COUNT_COPY = 'Every flag declared in the registry, grouped by the module that owns it.';

const stageNotice =
  'Per-flag switches stage a preview in this browser session and are read by no service — there is no durable flag store yet (§13 socket). ' +
  'The MODULE switch on each group header is the live one: it posts to svc-edge and refuses new commitments at the door. ' +
  'To halt all value movement use Ledger ops, which writes an attributed freeze row in svc-ledger.';

// ── Rows ────────────────────────────────────────────────────────────────────

function FlagRow({
  state,
  moduleKilled,
  criticalArmed,
  onSet,
  onClear,
}: {
  state: FlagState;
  moduleKilled: boolean;
  criticalArmed: boolean;
  onSet: (key: string, value: boolean) => void;
  onClear: (key: string) => void;
}) {
  const critical = isCritical(state.def.key);
  // Turning the ledger's posting switch off is the one action on this board with
  // a platform-wide blast radius, so it stays locked until the operator has
  // acknowledged that in the panel above.
  const locked = moduleKilled || (critical && state.enabled && !criticalArmed);

  return (
    <tr data-critical={critical} data-killed={moduleKilled}>
      <td className="adm-key">{state.def.key}</td>
      <td className="adm-desc">
        {state.def.description}
        {critical && <strong> — flipping this OFF halts ALL value movement platform-wide.</strong>}
      </td>
      <td className="adm-num">{state.def.drop === null ? '—' : state.def.drop}</td>
      <td>
        <StateChip on={state.enabled} critical={critical && !state.enabled} />
      </td>
      <td>
        <Chip tone={state.provenance === 'kill-switch' ? 'danger' : state.provenance === 'override' ? 'warn' : 'neutral'}>
          {PROVENANCE_LABEL[state.provenance]}
        </Chip>
      </td>
      <td>
        <span className="adm-inline">
          <Switch
            on={state.enabled}
            critical={critical}
            disabled={locked}
            preview
            onLabel="On"
            offLabel="Off"
            onToggle={() => onSet(state.def.key, !state.enabled)}
          />
          <Chip tone="dark">Preview</Chip>
          {state.provenance === 'override' && (
            <button type="button" className="adm-btn" onClick={() => onClear(state.def.key)}>
              Clear
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

function StateChip({ on, critical = false }: { on: boolean; critical?: boolean }) {
  if (on)
    return (
      <Chip tone="live" dot>
        {'Live'}
      </Chip>
    );
  return (
    <Chip tone={critical ? 'danger' : 'dark'} dot={critical}>
      {critical ? 'HALTED' : 'Dark'}
    </Chip>
  );
}

function Switch({
  on,
  onLabel,
  offLabel,
  onToggle,
  critical = false,
  disabled = false,
  preview = false,
  title,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
  critical?: boolean;
  disabled?: boolean;
  /** True when flipping this changes only this browser session. */
  preview?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="adm-switch"
      data-on={on}
      data-critical={critical}
      data-preview={preview}
      disabled={disabled}
      aria-pressed={on}
      // Announced by a screen reader and shown on hover. A switch that stages a
      // preview and a switch that halts a market must not present identically.
      aria-description={preview ? 'Preview only — changes this browser session, not the platform' : undefined}
      title={title ?? (preview ? 'Preview only — changes this browser session, not the platform' : undefined)}
      onClick={onToggle}
    >
      <span>{onLabel}</span>
      <span>{offLabel}</span>
    </button>
  );
}

// ── The one switch that stops the platform ──────────────────────────────────

function CriticalSwitch({
  state,
  armed,
  onArm,
  onSet,
  onClear,
}: {
  state: FlagState;
  armed: boolean;
  onArm: (value: boolean) => void;
  onSet: (key: string, value: boolean) => void;
  onClear: (key: string) => void;
}) {
  return (
    <Panel
      title="ledger.posting — platform-wide value movement"
      className="adm-panel--warn"
      actions={
        <span className="adm-inline">
          <Chip tone="warn" dot>
            Preview only
          </Chip>
          <StateChip on={state.enabled} critical={!state.enabled} />
        </span>
      }
    >
      <div className="adm-stack">
        {/*
          THE MOST MISLEADING CONTROL IN THE CONSOLE, BEFORE THIS.

          A panel styled as the platform's emergency stop, a "Halt posting"
          button behind an acknowledgement checkbox, and a flag switch underneath
          it — all of which set `overrides` in this component's React state. It
          read exactly like the money plane's kill and it was a browser boolean,
          and nothing on the panel said otherwise.

          It is kept, because seeing the resolved value of `ledger.posting` and
          WHY it resolved that way is genuinely useful. It is de-escalated: warn
          rather than danger, "preview" in the title bar, and the real control
          named with a link, so an operator who came here to stop the platform
          leaves this panel and goes to the one that can.
        */}
        <div className="adm-callout" data-tone="warn">
          <strong>This panel halts nothing — it previews a flag</strong>
          The buttons below stage a value for <code>ledger.posting</code> in this browser session. There is no durable flag store (§13), so
          no service ever reads what is staged here. <b>To actually stop value movement, use Ledger ops</b> — that screen posts to
          <code> /api/ledger-freeze</code> and svc-ledger writes a durable, attributed <code>posting_freeze</code> row.
        </div>

        <div className="adm-callout" data-tone="danger">
          <strong>What the real freeze does</strong>
          Every module posts through the ledger. Freezing it halts ALL value movement platform-wide — trade fills, payouts, escrow releases,
          card authorisations, staking, settlement — at once and without warning to users. It is the correct action after a reconciliation
          mismatch (§4.2: an unverifiable book must stop accepting writes) and the wrong action for anything smaller.
        </div>

        <div className="adm-inline">
          <a className="adm-btn" data-tone="danger" href="/ledger">
            Go to Ledger ops — the freeze that works
          </a>
        </div>

        <div className="adm-inline">
          <label className="adm-check">
            <input type="checkbox" checked={armed} onChange={(event) => onArm(event.target.checked)} />
            <span>I understand the two buttons below only stage a preview in this browser and halt nothing.</span>
          </label>
        </div>

        <div className="adm-inline">
          <button
            type="button"
            className="adm-btn"
            disabled={!armed || !state.enabled}
            title="Preview only — changes this browser session, not the platform"
            onClick={() => onSet(state.def.key, false)}
          >
            Preview OFF
          </button>
          <button
            type="button"
            className="adm-btn"
            disabled={state.enabled}
            title="Preview only — changes this browser session, not the platform"
            onClick={() => onSet(state.def.key, true)}
          >
            Preview ON
          </button>
          {state.provenance === 'override' && (
            <button type="button" className="adm-btn" onClick={() => onClear(state.def.key)}>
              Clear override
            </button>
          )}
          <span className="adm-footnote">
            Decided by <b>{PROVENANCE_LABEL[state.provenance]}</b>.
          </span>
        </div>
      </div>
    </Panel>
  );
}
