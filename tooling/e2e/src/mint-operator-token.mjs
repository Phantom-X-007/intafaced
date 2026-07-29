#!/usr/bin/env node
/**
 * Mint an operator token for `apps/admin` (§14.6).
 *
 *   node tooling/e2e/src/mint-operator-token.mjs [userId]
 *
 * WHY THIS SCRIPT EXISTS, AND WHY IT SHOULD NOT.
 *
 * `AuthService.defaultScopes()` in svc-identity grants no `admin:*` scope,
 * `STEP_UP_SCOPES` adds only `trade:withdraw`, and there is no role table, no
 * grant table and no operator-issuance path anywhere in the service. **No login
 * the platform can perform produces an operator.** Every `admin:*` procedure
 * that already exists — `kyc.approve`, `deposit.credit`, `ledger.freeze`, and
 * now the kill-switch — is unreachable by any session svc-identity can issue.
 *
 * So an operator today has to be minted out of band with the deployment's
 * signing key, which is what this does. It is not a good answer; it is the
 * honest one, and it is a script rather than a hidden default so that the gap
 * is visible every time somebody needs an operator.
 *
 * §13 SOCKET — operator issuance. When svc-identity grows one (an operator
 * role, a grant, a break-glass flow with its own audit trail), this file is
 * deleted and `ADMIN_OPERATOR_TOKEN` comes from it instead.
 */
import { createHmac, randomUUID } from 'node:crypto';

const secret = process.env.JWT_ACCESS_SECRET;
if (!secret || secret.length < 32) {
  console.error('JWT_ACCESS_SECRET must be set (≥ 32 chars) and must match the fleet the token will be presented to.');
  process.exit(1);
}

const issuer = process.env.JWT_ISSUER ?? 'intafaced';
const audience = process.env.JWT_AUDIENCE ?? 'intafaced.api';
const ttl = Number(process.env.OPERATOR_TOKEN_TTL_SECONDS ?? 3600);
const userId = process.argv[2] ?? randomUUID();

/**
 * `accessClaimsSchema` in `packages/auth/src/tokens.ts` requires `sub` to be a
 * UUID. Checked here rather than left to the platform, because the failure is
 * otherwise a 401 reading "Access token payload is malformed" from a component
 * three hops away — which is exactly how this was found, and it cost more than
 * this check does.
 */
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  console.error(`operator id must be a UUID (got "${userId}") — the platform's access-token schema requires one. Omit the argument for a random one.`);
  process.exit(1);
}

const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
const now = Math.floor(Date.now() / 1000);

const header = encode({ alg: 'HS256', typ: 'JWT' });
const payload = encode({
  sub: userId,
  // `admin:write` is what the edge's control plane requires; `mfa` is what its
  // `requireMfa` requires. Nothing else — an operator token that carried
  // `admin:treasury` as well would be a token that can also mint balances.
  scopes: ['admin:write', 'admin:read'],
  tier: 'institutional',
  mfa: true,
  sid: randomUUID(),
  iss: issuer,
  aud: audience,
  iat: now,
  exp: now + ttl,
  jti: randomUUID(),
});
const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

process.stdout.write(`${header}.${payload}.${signature}\n`);
console.error(`# operator ${userId}, expires in ${ttl}s`);
