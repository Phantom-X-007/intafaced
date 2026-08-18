/**
 * Portfolio Agent kill-switch.
 *
 * Auto-rebalance is Class M the moment it places. This slice never places, but
 * the switch is still real: an operator (or missing flag) turns planning off.
 *
 * `AGENTS_PORTFOLIO_ENABLED` off / unset / empty → killed.
 * Explicit `1` / `true` / `on` / `yes` → live.
 */

const OFF = new Set(['0', 'false', 'off', 'no']);
const ON = new Set(['1', 'true', 'on', 'yes']);

export function isPortfolioAgentKilled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.AGENTS_PORTFOLIO_ENABLED;
  if (raw === undefined || raw.trim() === '') return true;
  const v = raw.trim().toLowerCase();
  if (OFF.has(v)) return true;
  if (ON.has(v)) return false;
  return true;
}
