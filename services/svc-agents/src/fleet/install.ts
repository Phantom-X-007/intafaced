/**
 * R-agentic / PTX-M28-R12 — marketplace install is not trading authority.
 *
 * A package may *claim* place/withdraw tools, a live capacity mode, and a
 * withdraw scope. Recording the install copies those claims as untrusted
 * annotations. It does not create a grant, does not issue a credential, and
 * does not make any tool callable.
 *
 * Product-agent money denylist stays in `parseGuardrail` / `FLEET_HARD_MONEY_WRITE_TOOLS`.
 * This module is the install door, not a denylist exception.
 */

import {
  AGENT_WITHDRAW_SCOPE,
  EMPTY_SESSION_STATE,
  evaluateToolCall,
  hasWithdrawScope,
  parseGuardrail,
  type Guardrail,
  type GuardrailDecision,
} from './guardrails.js';

const ID_MAX = 64;
const TOOL_MAX = 120;
const CLAIM_CAP = 50;

export type MarketplaceInstallInput = {
  readonly packageId: string;
  readonly version: string;
  readonly publisher: string;
  /** Publisher-claimed tools. Display/annotation only — never a grant. */
  readonly claimedTools?: readonly string[];
  /** Publisher-claimed scopes. `withdraw` here is not a credential. */
  readonly claimedScopes?: readonly string[];
  /** Publisher-claimed capacity. Install never adopts a live mode. */
  readonly claimedCapacityMode?: string;
};

export type MarketplaceInstall = {
  readonly packageId: string;
  readonly version: string;
  readonly publisher: string;
  readonly claimedTools: readonly string[];
  readonly claimedScopes: readonly string[];
  readonly claimedCapacityMode: string | undefined;
  readonly grantCreated: false;
  readonly tradingAuthority: false;
  readonly withdrawCredentialIssued: false;
  readonly callable: false;
};

export type MarketplaceInstallDoor = {
  readonly status: 'installed';
  readonly packageId: string;
  readonly version: string;
  readonly publisher: string;
  readonly claimedTools: string[];
  readonly claimedScopes: string[];
  readonly grantCreated: false;
  readonly tradingAuthority: false;
  readonly withdrawCredentialIssued: false;
  readonly callable: false;
  readonly placeAllowed: false;
  readonly withdrawAllowed: false;
};

export type InstallCredential = {
  readonly scopes: readonly string[];
};

function pinId(label: string, value: string): string {
  const v = value.trim();
  if (!v || v.length > ID_MAX) {
    throw new Error(`${label} is required`);
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(v)) {
    throw new Error(`${label} is not a package id`);
  }
  return v;
}

function pinClaims(values: readonly string[] | undefined, maxLen: number): readonly string[] {
  if (values === undefined) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values.slice(0, CLAIM_CAP)) {
    const v = raw.trim();
    if (!v || v.length > maxLen || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Record a package install. Claims stay claims. */
export function installMarketplaceRelease(input: MarketplaceInstallInput): MarketplaceInstall {
  const packageId = pinId('packageId', input.packageId);
  const version = pinId('version', input.version);
  const publisher = pinId('publisher', input.publisher);
  const claimedCapacityMode =
    input.claimedCapacityMode === undefined ? undefined : input.claimedCapacityMode.trim().slice(0, ID_MAX) || undefined;

  return {
    packageId,
    version,
    publisher,
    claimedTools: pinClaims(input.claimedTools, TOOL_MAX),
    claimedScopes: pinClaims(input.claimedScopes, ID_MAX),
    claimedCapacityMode,
    grantCreated: false,
    tradingAuthority: false,
    withdrawCredentialIssued: false,
    callable: false,
  };
}

/**
 * Authority implied by an install: none.
 *
 * Tools, scopes, and live capacity from the package are not copied. A later
 * grant is a separate product act — not this function.
 */
export function guardrailFromInstall(install: MarketplaceInstall): Guardrail {
  void install;
  return parseGuardrail({
    agentId: 'marketplace-install',
    version: 1,
    scopes: [],
    tools: [],
    limits: {
      maxActionsPerSession: 1,
      maxOutputTokensPerCall: 1,
      maxSpendPerSession: '0',
      allowedModules: [],
      allowedTasks: [],
    },
  });
}

/** Credential issued at install: never includes withdrawal. */
export function credentialFromInstall(install: MarketplaceInstall): InstallCredential {
  void install;
  return { scopes: [] };
}

export function evaluateInstallToolCall(install: MarketplaceInstall, tool: string): GuardrailDecision {
  return evaluateToolCall(guardrailFromInstall(install), EMPTY_SESSION_STATE, {
    tool,
    approved: true,
    idempotencyKey: 'install-falsify',
  });
}

export function installAllowsTool(install: MarketplaceInstall, tool: string): boolean {
  return evaluateInstallToolCall(install, tool).allowed;
}

export function installIssuedWithdraw(install: MarketplaceInstall): boolean {
  return hasWithdrawScope(credentialFromInstall(install).scopes) || credentialFromInstall(install).scopes.includes(AGENT_WITHDRAW_SCOPE);
}

/**
 * Public install door. Throws rather than report place/withdraw allowed —
 * those flags are a contract, not a suggestion.
 */
export function marketplaceInstallDoor(input: MarketplaceInstallInput): MarketplaceInstallDoor {
  const installed = installMarketplaceRelease(input);
  if (installAllowsTool(installed, 'trade.order') || installAllowsTool(installed, 'trade.place')) {
    throw new Error('marketplace install must not allow place');
  }
  if (installAllowsTool(installed, 'bank.withdraw') || installAllowsTool(installed, 'bank.transfer')) {
    throw new Error('marketplace install must not allow withdraw');
  }
  if (installIssuedWithdraw(installed) || installed.withdrawCredentialIssued !== false) {
    throw new Error('marketplace install must not issue a withdrawal credential');
  }
  if (installed.grantCreated || installed.tradingAuthority || installed.callable) {
    throw new Error('marketplace install must not create a grant or trading authority');
  }

  return {
    status: 'installed',
    packageId: installed.packageId,
    version: installed.version,
    publisher: installed.publisher,
    claimedTools: [...installed.claimedTools],
    claimedScopes: [...installed.claimedScopes],
    grantCreated: false,
    tradingAuthority: false,
    withdrawCredentialIssued: false,
    callable: false,
    placeAllowed: false,
    withdrawAllowed: false,
  };
}
