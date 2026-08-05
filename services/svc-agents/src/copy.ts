/**
 * USER-FACING COPY — the only place in this service where a string reaches a
 * human.
 *
 * Two rules meet in this file.
 *
 * §14 DoD 4: "Every user-facing string i18n-keyed." So nothing here is emitted
 * as prose from a handler — the service returns a KEY plus parameters, and the
 * surface renders it. `EN` below is the reference catalogue, not the wire
 * format.
 *
 * Doctrine §0.7: "No third-party system names anywhere in UI, API responses, or
 * docs shipped to users." The model behind a completion is an implementation
 * detail of the gateway. In everything a user reads, the intelligence is
 * **Sovereign Intelligence**, the engine is the **Neural Engine**, and the
 * onboarding artefact is the **Identity Blueprint** — those three terms and no
 * others.
 *
 * That is why `AgentAction.userMessageKey` exists at all: if refusal text were
 * assembled ad hoc at the throw site, the vocabulary would drift the first time
 * someone debugged a routing problem and pasted a vendor's error string into a
 * message. Keeping every user-visible line in one enumerated table makes the
 * rule checkable — `copy.test.ts` asserts it from inside the package, and
 * `tooling/ci/brand-scan.mjs` asserts it from outside.
 */

export const COPY_KEYS = [
  'agents.session.opened',
  'agents.session.closed',
  'agents.action.completed',
  'agents.action.executed',
  'agents.usage.settled',
  'agents.usage.free',
  'agents.refused.tool_not_declared',
  'agents.refused.tool_call_limit',
  'agents.refused.module_not_allowed',
  'agents.refused.step_limit',
  'agents.refused.spend_limit',
  'agents.refused.output_limit',
  'agents.refused.approval_required',
  'agents.refused.session_closed',
  'agents.error.route_not_found',
  'agents.error.capability_unavailable',
  'agents.error.engine_unavailable',
  'agents.error.window_sealed',
  'agents.scanner.empty',
  'agents.scanner.unavailable',
  'agents.merchant.empty',
  'agents.merchant.unavailable',
  'agents.copy_intel.empty',
  'agents.copy_intel.unavailable',
] as const;

export type CopyKey = (typeof COPY_KEYS)[number];

/**
 * Reference English catalogue.
 *
 * `{placeholders}` are filled from an action's `userMessageParams`. A parameter
 * is always a value the user already knows about — a tool name they granted, a
 * limit they agreed to, an amount they were charged. Never a model id, never an
 * upstream error body, never a request identifier from outside the platform.
 */
export const EN: Readonly<Record<CopyKey, string>> = {
  'agents.session.opened': 'Sovereign Intelligence session opened for {agent}.',
  'agents.session.closed': 'Session closed. {steps} action(s) recorded.',

  'agents.action.completed': 'The Neural Engine answered for “{task}”.',
  'agents.action.executed': 'Ran {tool} inside your guardrails.',

  'agents.usage.settled': 'Metered usage for this session settled: {amount} {asset}.',
  'agents.usage.free': 'This session is on your included allowance — nothing was charged.',

  // Refusals. Each names the limit that stopped the action, because "refused"
  // without a reason is indistinguishable from a fault.
  'agents.refused.tool_not_declared': 'Refused: {tool} is not in this agent’s declared toolset, so it was not run.',
  'agents.refused.tool_call_limit': 'Refused: {tool} has already been used {limit} time(s) this session, which is its limit.',
  'agents.refused.module_not_allowed': 'Refused: this agent is not permitted to act in {module}.',
  'agents.refused.step_limit': 'Refused: this session has reached its limit of {limit} action(s).',
  'agents.refused.spend_limit': 'Refused: this session has reached its spend limit of {limit} {asset}.',
  'agents.refused.output_limit': 'Refused: the request asked for more output than this agent is allowed to produce.',
  'agents.refused.approval_required': 'Held for your approval: {tool} needs you to confirm before it runs.',
  'agents.refused.session_closed': 'Refused: this session is closed. Start a new one to continue.',

  'agents.error.route_not_found': 'No Sovereign Intelligence route is configured for “{task}”.',
  'agents.error.capability_unavailable': 'The Neural Engine cannot serve this kind of request right now.',
  'agents.error.engine_unavailable': 'The Neural Engine is unavailable. Nothing was run and nothing was charged.',
  'agents.error.window_sealed': 'This usage period is already settled.',

  'agents.scanner.empty': 'No markets were provided to rank.',
  'agents.scanner.unavailable': 'Market signals are unavailable right now — quotes are missing or too old to trust.',
  'agents.merchant.empty': 'No approval-rate samples were provided to watch.',
  'agents.merchant.unavailable': 'Approval-rate metrics are unavailable right now — samples are missing or too old to trust.',
  'agents.copy_intel.empty': 'No leader performance samples were provided.',
  'agents.copy_intel.unavailable': 'Leader stats are unavailable — samples are incomplete or the window is invalid.',
};

const KEY_SET: ReadonlySet<string> = new Set(COPY_KEYS);

export function isCopyKey(value: string): value is CopyKey {
  return KEY_SET.has(value);
}

/**
 * Render a key for logs and tests. Surfaces render from their own catalogues;
 * this exists so a developer reading `agent_actions` can see what the user saw.
 */
export function render(key: CopyKey, params: Readonly<Record<string, string | number>> = {}): string {
  return EN[key].replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
