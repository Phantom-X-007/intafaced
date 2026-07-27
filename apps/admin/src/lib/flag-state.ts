import {
  FLAG_REGISTRY,
  MODULE_IDS,
  MODULES,
  isEnabled,
  resolveAll,
  type FlagContext,
  type FlagDef,
  type ModuleId,
} from '@intafaced/config';

/**
 * Flag state, as an operator needs to read it.
 *
 * `resolveAll()` answers "is it on?". It does not answer "why?", and on a
 * kill-switch board the second question is the one that matters — an operator
 * who cannot tell an env override from a drop default will flip the wrong
 * thing. Everything below DERIVES the answer by re-asking the real
 * `isEnabled()` with narrowed contexts. No resolution logic is reimplemented
 * here, and no flag is listed here that is not in `FLAG_REGISTRY`.
 */

export type Provenance =
  /** Module kill-switch is off — beats everything else (§14). */
  | 'kill-switch'
  /** An explicit override in this console session. */
  | 'override'
  /** An `INTAFACED_FLAG_*` variable on the running process. */
  | 'env'
  /** The current LAUNCH_DROP has reached the flag's drop. */
  | 'drop'
  /** The drop clock has not reached it yet. */
  | 'awaiting-drop'
  /** `drop === null` — never on by default, at any drop. */
  | 'off-clock';

export const PROVENANCE_LABEL: Readonly<Record<Provenance, string>> = {
  'kill-switch': 'Module kill-switch',
  override: 'Operator override',
  env: 'Env override',
  drop: 'Drop reached',
  'awaiting-drop': 'Awaiting drop',
  'off-clock': 'Off the drop clock',
};

export interface FlagState {
  readonly def: FlagDef;
  readonly enabled: boolean;
  readonly provenance: Provenance;
  /** What this flag would be with no overrides at all — the drop-clock answer. */
  readonly baseline: boolean;
}

/** The blast radius of the ledger's posting switch is the whole platform. */
export const CRITICAL_FLAG_KEY = 'ledger.posting';

export function isCritical(key: string): boolean {
  return key === CRITICAL_FLAG_KEY;
}

function provenanceOf(def: FlagDef, ctx: FlagContext): Provenance {
  if (ctx.disabledModules?.includes(def.module)) return 'kill-switch';
  if (ctx.overrides?.[def.key] !== undefined) return 'override';

  // Ask the real resolver whether env alone changes the answer. If dropping the
  // env slice flips the result, the env slice is what decided it.
  const withEnv = isEnabled(def.key, { drop: ctx.drop, env: ctx.env });
  const withoutEnv = isEnabled(def.key, { drop: ctx.drop });
  if (withEnv !== withoutEnv) return 'env';

  if (def.drop === null) return 'off-clock';
  return withoutEnv ? 'drop' : 'awaiting-drop';
}

export function flagStates(ctx: FlagContext): FlagState[] {
  const resolved = resolveAll(ctx);
  return FLAG_REGISTRY.map((def) => ({
    def,
    enabled: resolved[def.key] === true,
    provenance: provenanceOf(def, ctx),
    baseline: isEnabled(def.key, { drop: ctx.drop }),
  }));
}

export interface ModuleGroup {
  readonly module: ModuleId;
  readonly service: string;
  readonly phase: string;
  readonly planes: readonly string[];
  readonly custodial: boolean;
  readonly killed: boolean;
  readonly flags: readonly FlagState[];
}

/** Grouped in `MODULE_IDS` order, which is phase order — the build order (§12). */
export function groupByModule(states: readonly FlagState[], disabledModules: readonly ModuleId[]): ModuleGroup[] {
  return MODULE_IDS.map((id) => {
    const def = MODULES[id];
    return {
      module: id,
      service: def.service,
      phase: def.phase,
      planes: def.planes,
      custodial: def.custodial,
      killed: disabledModules.includes(id),
      flags: states.filter((s) => s.def.module === id),
    };
  }).filter((g) => g.flags.length > 0);
}

/**
 * Modules that declare no flag at all. §14.6 requires a kill-switch per module,
 * and `tooling/ci/dod-gate.mjs` fails a service whose module id never appears in
 * `flags.ts` — so this list is the set of modules that cannot ship as written.
 */
export function modulesWithoutKillSwitch(): ModuleId[] {
  const covered = new Set(FLAG_REGISTRY.map((f) => f.module));
  return MODULE_IDS.filter((id) => !covered.has(id));
}

export interface StateDiff {
  readonly key: string;
  readonly from: boolean;
  readonly to: boolean;
}

/** What the staged overrides would actually change, flag by flag. */
export function diffStates(before: readonly FlagState[], after: readonly FlagState[]): StateDiff[] {
  const previous = new Map(before.map((s) => [s.def.key, s.enabled]));
  const out: StateDiff[] = [];
  for (const state of after) {
    const from = previous.get(state.def.key);
    if (from !== undefined && from !== state.enabled) out.push({ key: state.def.key, from, to: state.enabled });
  }
  return out;
}
