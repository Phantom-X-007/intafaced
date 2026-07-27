/**
 * PERMISSION SCOPES (§4.1 api_keys, §9 Public API).
 *
 * A scope is `<module>:<action>`. Sessions and API keys both carry scopes;
 * nothing in the OS authorises on "is logged in" alone.
 *
 * `:write` never implies `:read` and `:read` never implies `:write` — implication
 * is spelled out in IMPLIED below, so an audit of what a key can do is a lookup,
 * not an inference.
 */

export const SCOPES = [
  // Identity
  'identity:read',
  'identity:write',

  // Ledger — note there is no `ledger:write`. Balances move through recipes
  // invoked by a module's own service credentials, never through a user token.
  'ledger:read',

  // Trade
  'trade:read',
  'trade:write',
  'trade:withdraw',

  // Pay
  'pay:read',
  'pay:write',
  'pay:refund',
  'pay:payout',

  // P2P
  'p2p:read',
  'p2p:write',

  // Token
  'token:read',
  'token:stake',

  // Blueprint — `:write` is what runs an onboarding session or erases a
  // Blueprint. Reading someone else's is governed by `blueprints.visibility`
  // on top of this scope, never by the scope alone.
  'blueprint:read',
  'blueprint:write',

  // Bank
  'bank:read',
  'bank:write',
  'bank:card',

  // Launch / Market / Academy
  'launch:read',
  'launch:write',
  'market:read',
  'market:write',
  'academy:read',
  'academy:write',

  // Agents — an agent acting for a user needs this plus the module scopes it uses.
  'agents:read',
  'agents:execute',

  // Protocol plane (read-only by definition: keys are the user's, not ours)
  'protocol:read',

  // Operator
  'admin:read',
  'admin:write',
  'admin:treasury',
  'admin:compliance',
] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(SCOPES);

export function isScope(value: string): value is Scope {
  return SCOPE_SET.has(value);
}

/**
 * Explicit implication. `admin:write` grants `admin:read` because an operator
 * who can change a thing can self-evidently see it; nothing else cascades.
 */
const IMPLIED: Partial<Record<Scope, readonly Scope[]>> = {
  'admin:write': ['admin:read'],
  'admin:treasury': ['admin:read'],
  'admin:compliance': ['admin:read'],
  'identity:write': ['identity:read'],
  'trade:write': ['trade:read'],
  'pay:write': ['pay:read'],
  'pay:refund': ['pay:read'],
  'pay:payout': ['pay:read'],
  'p2p:write': ['p2p:read'],
  'token:stake': ['token:read'],
  'blueprint:write': ['blueprint:read'],
  'bank:write': ['bank:read'],
  'bank:card': ['bank:read'],
  'launch:write': ['launch:read'],
  'market:write': ['market:read'],
  'academy:write': ['academy:read'],
  'agents:execute': ['agents:read'],
};

/** Expand a scope list to everything it actually grants. */
export function expandScopes(granted: readonly string[]): Set<Scope> {
  const out = new Set<Scope>();
  for (const s of granted) {
    if (!isScope(s)) continue;
    out.add(s);
    for (const implied of IMPLIED[s] ?? []) out.add(implied);
  }
  return out;
}

export function hasScope(granted: readonly string[], required: Scope): boolean {
  return expandScopes(granted).has(required);
}

export function hasAllScopes(granted: readonly string[], required: readonly Scope[]): boolean {
  const expanded = expandScopes(granted);
  return required.every((r) => expanded.has(r));
}

/**
 * Scopes that must never be granted to a long-lived API key.
 *
 * Withdrawal and treasury movement require an interactive session with 2FA
 * (§9 Security: withdrawal allow-lists + delay tiers). A leaked key must not be
 * able to move value off the platform on its own.
 *
 * The membership test is "does this move value OFF the platform", not "does it
 * feel dangerous". `pay:payout` was missing: it sends a merchant's settled
 * balance out through a rail, which is the same class of action as
 * `trade:withdraw` and had none of the same protection. Found by the agent
 * building svc-pay, which noticed the asymmetry while writing authorisation
 * tests and — correctly — flagged it rather than changing a shared package
 * unilaterally.
 */
export const INTERACTIVE_ONLY_SCOPES: readonly Scope[] = ['trade:withdraw', 'admin:treasury', 'bank:card', 'pay:payout'];

export function assertKeyScopesAllowed(scopes: readonly string[]): void {
  const forbidden = scopes.filter((s) => (INTERACTIVE_ONLY_SCOPES as readonly string[]).includes(s));
  if (forbidden.length > 0) {
    throw new Error(
      `Scopes ${forbidden.join(', ')} cannot be granted to an API key — they require an interactive, 2FA-backed session (§9)`,
    );
  }
}
