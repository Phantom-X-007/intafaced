'use client';

import { useMemo, useState } from 'react';
import { Panel, StatBlock } from '@intafaced/ui';
import type { Drop, ModuleId } from '@intafaced/config';
import { Chip } from '@/components/chip';
import { dropLabel } from '@/lib/drops';
import {
  CRITICAL_FLAG_KEY,
  PROVENANCE_LABEL,
  diffStates,
  flagStates,
  groupByModule,
  isCritical,
  modulesWithoutKillSwitch,
  type FlagState,
} from '@/lib/flag-state';

/**
 * KILL-SWITCH BOARD — §14.6 "Admin controls: kill-switch + config surface".
 *
 * Every row comes from `FLAG_REGISTRY` and every on/off answer comes from
 * `resolveAll()` / `isEnabled()` in `@intafaced/config`. The board cannot drift
 * from what the services enforce because it holds no list of its own.
 *
 * ── Two kinds of switch on one board, and the difference is not cosmetic ────
 *
 * **Module kill-switches are LIVE.** Toggling one posts to `/api/kill-switch`,
 * which reaches `svc-edge`'s control plane, which refuses new commitments to
 * that module on the request path — while still passing cancels and reads, so
 * the switch never traps a user's funds. The board renders the state the
 * platform reports, not the state this browser wishes for.
 *
 * **Individual FLAG overrides are still staged locally.** They are a faithful
 * preview of what the same override would do inside a service, and they still
 * go nowhere, because there is still no durable flag store. That is called out
 * on the panel rather than left for an operator to discover during an incident.
 */

export type ControlStatus = 'reachable' | 'unconfigured' | 'unreachable';

export interface KillSwitchBoardProps {
  drop: Drop;
  flagEnv: Record<string, string>;
  /** Whether this console can reach the platform control plane at all. */
  controlStatus: ControlStatus;
  /** One sentence an operator can act on, when it cannot. */
  controlDetail: string | null;
  /** Modules the PLATFORM reports as killed — read from svc-edge, not from this browser. */
  liveDisabledModules: ModuleId[];
  liveReasons: Record<string, string>;
}

export function KillSwitchBoard({ drop, flagEnv, controlStatus, controlDetail, liveDisabledModules, liveReasons }: KillSwitchBoardProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [disabledModules, setDisabledModules] = useState<ModuleId[]>(liveDisabledModules);
  const [criticalArmed, setCriticalArmed] = useState(false);
  const [pending, setPending] = useState<ModuleId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = controlStatus === 'reachable';

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

  /**
   * THE LIVE ONE.
   *
   * Optimism is deliberately absent: the board does not move until the platform
   * has confirmed the new state, because a switch that looks flipped and is not
   * is worse than one that takes a second. `next` comes from the response, so if
   * two operators act at once the board shows what actually happened.
   */
  async function toggleModule(module: ModuleId) {
    if (!live) {
      setError(controlDetail ?? 'This console cannot reach the control plane.');
      return;
    }

    const disabled = !disabledModules.includes(module);
    setPending(module);
    setError(null);

    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          module,
          disabled,
          reason: disabled ? `operator killed ${module} from the console` : `operator restored ${module} from the console`,
        }),
      });
      const body = (await res.json()) as { snapshot?: { disabledModules?: ModuleId[] }; detail?: string; error?: string };

      if (!res.ok) {
        setError(body.detail ?? body.error ?? `The control plane answered ${res.status}.`);
        return;
      }
      setDisabledModules(body.snapshot?.disabledModules ?? []);
    } catch (err) {
      setError(`The control plane did not answer: ${(err as Error).message}`);
    } finally {
      setPending(null);
    }
  }

  /** Clears only what is staged locally. A live kill is not something a "reset" button undoes. */
  function reset() {
    setOverrides({});
    setCriticalArmed(false);
    setError(null);
  }

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1>Kill-switches</h1>
          <p>
            {FLAG_COUNT_COPY} Resolution runs through the same <code>resolveAll()</code> the services call, at the drop reported in the
            header — {dropLabel(drop)}. A module kill-switch beats every other input, including an env override: operator safety is not
            overridable.
          </p>
        </div>
        <div className="adm-inline">
          <button type="button" className="adm-btn" onClick={reset} disabled={changes.length === 0}>
            Reset staged
          </button>
        </div>
      </div>

      <Panel
        title="Control plane"
        className={live ? undefined : 'adm-panel--warn'}
        actions={<Chip tone={live ? 'live' : 'warn'}>{CONTROL_LABEL[controlStatus]}</Chip>}
      >
        <div className="adm-stack">
          <p className="adm-footnote">{live ? CONTROL_LIVE_COPY : (controlDetail ?? CONTROL_DEAD_COPY)}</p>
          {error && (
            <div className="adm-callout" data-tone="danger">
              <strong>The last switch did not take</strong>
              {error}
            </div>
          )}
          {live && disabledModules.length > 0 && (
            <div className="adm-inline">
              {disabledModules.map((id) => (
                <Chip key={id} tone="danger">
                  {id} killed{liveReasons[id] ? ` — ${liveReasons[id]}` : ''}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Platform state" live>
        <div className="adm-statrow">
          <StatBlock label="Flags live" value={`${liveCount} / ${staged.length}`} />
          <StatBlock label="Off the drop clock" value={offClockCount} deltaLabel="never on by default" />
          <StatBlock label="Modules killed" value={disabledModules.length} />
          <StatBlock label="Staged changes" value={changes.length} />
          <StatBlock label="Env overrides" value={Object.keys(flagEnv).length} deltaLabel="INTAFACED_FLAG_*" />
        </div>
      </Panel>

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

      <Panel title="Flags by module" className="adm-flush">
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Flag</th>
                <th>Description</th>
                <th>Drop</th>
                <th>State</th>
                <th>Decided by</th>
                <th>Switch</th>
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
                      <Switch
                        on={!group.killed}
                        onLabel="Enabled"
                        offLabel="Killed"
                        disabled={!live || pending === group.module}
                        onToggle={() => void toggleModule(group.module)}
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

const FLAG_COUNT_COPY = 'Every flag declared in the registry, grouped by the module that owns it.';

const CONTROL_LABEL: Readonly<Record<ControlStatus, string>> = {
  reachable: 'Live',
  unconfigured: 'Not configured',
  unreachable: 'Unreachable',
};

const CONTROL_LIVE_COPY =
  'Module switches on this board are LIVE. Killing a module tells svc-edge to refuse new commitments to it immediately — new orders, ' +
  'new payments, new escrows — while still passing cancels and reads, because a control that traps funds is not a safety control. ' +
  'Individual flag rows below are still staged locally; only the module switch reaches the platform.';

const CONTROL_DEAD_COPY =
  'This console cannot reach the platform control plane, so the module switches below are inert. Nothing on this page can change the ' +
  'platform until that is fixed.';

const stageNotice =
  'These are FLAG overrides, and they are held in this browser session — they have not been sent anywhere. There is still no durable ' +
  'flag store. The MODULE switches above them are live and do reach svc-edge; these rows are a faithful preview of what the same ' +
  'override would do inside a service.';

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
            onLabel="On"
            offLabel="Off"
            onToggle={() => onSet(state.def.key, !state.enabled)}
          />
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
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
  critical?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="adm-switch"
      data-on={on}
      data-critical={critical}
      disabled={disabled}
      aria-pressed={on}
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
      className="adm-panel--danger"
      actions={<StateChip on={state.enabled} critical={!state.enabled} />}
    >
      <div className="adm-stack">
        <div className="adm-callout" data-tone="danger">
          <strong>Blast radius: the entire platform</strong>
          Every module posts through the ledger. Turning <code>ledger.posting</code> OFF halts ALL value movement platform-wide — trade
          fills, payouts, escrow releases, card authorisations, staking, settlement — at once and without warning to users. It is the
          correct action after a reconciliation mismatch (§4.2: an unverifiable book must stop accepting writes) and the wrong action for
          anything smaller.
        </div>

        <div className="adm-inline">
          <label className="adm-check">
            <input type="checkbox" checked={armed} onChange={(event) => onArm(event.target.checked)} />
            <span>I understand this halts all value movement platform-wide, for every user, immediately.</span>
          </label>
        </div>

        <div className="adm-inline">
          <button
            type="button"
            className="adm-btn"
            data-tone="danger"
            disabled={!armed || !state.enabled}
            onClick={() => onSet(state.def.key, false)}
          >
            Halt posting
          </button>
          <button type="button" className="adm-btn" disabled={state.enabled} onClick={() => onSet(state.def.key, true)}>
            Resume posting
          </button>
          {state.provenance === 'override' && (
            <button type="button" className="adm-btn" onClick={() => onClear(state.def.key)}>
              Clear override
            </button>
          )}
          <span className="adm-footnote">
            Decided by <b>{PROVENANCE_LABEL[state.provenance]}</b>. A freeze issued from Ledger ops is the operational equivalent and
            carries its own confirmation.
          </span>
        </div>
      </div>
    </Panel>
  );
}
