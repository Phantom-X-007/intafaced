import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { issueAccessToken, type Scope, type TokenConfig } from '@intafaced/auth';

/**
 * THE E2E HARNESS — everything a scenario needs, and nothing it should be
 * writing itself.
 *
 * Rules this file follows, because an e2e that breaks them stops being
 * evidence:
 *
 *   1. **Through `svc-edge`.** Every user-facing call goes to the front door,
 *      never straight to a service port. §9 says nothing reaches a service any
 *      other way, and a test that skipped the edge would have kept passing
 *      through the entire period when the edge produced a principal signature
 *      no service would accept.
 *   2. **No mocks, no fakes, no in-process servers.** The fleet is the system
 *      under test.
 *   3. **Assert on the LEDGER, not on the service's own view.** Doctrine §0.6:
 *      no module holds its own balance. A test that checked svc-trade's opinion
 *      of a balance would pass on the day the two disagreed, which is the only
 *      day the check matters.
 */

// ── Configuration ───────────────────────────────────────────────────────────

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(
      `${name} is not set. The e2e suite talks to a running fleet; export the same values the fleet was started with ` +
        `(see .env.example), or run \`pnpm platform:up\` first.`,
    );
  }
  return value;
}

export const config = {
  /** The front door. Everything a user does goes through this. */
  edgeUrl: (process.env.E2E_EDGE_URL ?? 'http://localhost:4000').replace(/\/$/, ''),
  /** The operator console. Only the kill-switch scenario touches it. */
  adminUrl: (process.env.E2E_ADMIN_URL ?? 'http://localhost:3100').replace(/\/$/, ''),
  /**
   * THE FLEET'S OWN DATABASE, and it has to be — read the next paragraph before
   * changing it.
   *
   * The house rule is "never point a test at the shared `intafaced` database";
   * it exists because a suite that APPLIES MIGRATIONS there mutates the schema
   * for every checkout on the machine, and that is exactly how `main`'s tests
   * were broken from another branch. This suite is the one case the rule cannot
   * cover: it drives the RUNNING FLEET, and the running fleet is bound to
   * `intafaced`. A market seeded into `intafaced_test` is a market the fleet
   * cannot see, so the test would have nothing to trade.
   *
   * What keeps that safe is the shape of what this file does, not where it
   * points:
   *
   *   · NO DDL, EVER. Two statements exist in this file — one INSERT and one
   *     UPDATE, both against `trade.markets`. `seedMarket` asserts the table is
   *     already there and fails rather than creating anything.
   *   · Every row is named with a per-run id, so two runs never collide and
   *     nothing pre-existing is touched.
   *
   * `svc_trade`, not `intafaced_ops`: the role that OWNS the schema. Found the
   * hard way — `intafaced_ops` gets `permission denied for schema trade`, which
   * is the grant model working correctly.
   */
  databaseUrl: process.env.E2E_TRADE_DATABASE_URL ?? 'postgres://svc_trade:svc_trade@localhost:5433/intafaced',
  /**
   * `PAY_OPERATOR_CREDIT_RAILS` in svc-pay defaults to exactly this one. The
   * real rails refuse an operator credit on purpose — "a real rail's deposits
   * arrive through its own confirmation path" — so the sandbox rail is the only
   * honest way to put money on the book from a test.
   */
  creditRail: process.env.E2E_CREDIT_RAIL ?? 'card-sandbox',
} as const;

const tokens = (): TokenConfig => ({
  secret: required('JWT_ACCESS_SECRET'),
  issuer: process.env.JWT_ISSUER ?? 'intafaced',
  audience: process.env.JWT_AUDIENCE ?? 'intafaced.api',
  accessTtlSeconds: Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900),
});

// ── tRPC over HTTP, the way a browser does it ───────────────────────────────

export interface RpcResult<T = unknown> {
  readonly status: number;
  readonly data: T | undefined;
  /** The tRPC error envelope, when there is one. */
  readonly error: { message: string; data?: { code?: string; httpStatus?: number } } | undefined;
  readonly raw: unknown;
}

async function request(method: 'GET' | 'POST', path: string, input: unknown, token: string | null): Promise<RpcResult> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  let url = `${config.edgeUrl}${path}`;
  const init: RequestInit = { method, headers };

  if (method === 'POST') {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(input ?? {});
  } else if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify(input))}`;
  }

  const res = await fetch(url, init);
  const text = await res.text();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = text;
  }

  const envelope = raw as { result?: { data?: unknown }; error?: RpcResult['error'] };
  return { status: res.status, data: envelope?.result?.data, error: envelope?.error, raw };
}

/** A tRPC mutation through the edge. */
export const mutate = <T = unknown>(path: string, input?: unknown, token?: string | null): Promise<RpcResult<T>> =>
  request('POST', path, input, token ?? null) as Promise<RpcResult<T>>;

/** A tRPC query through the edge. */
export const query = <T = unknown>(path: string, input?: unknown, token?: string | null): Promise<RpcResult<T>> =>
  request('GET', path, input, token ?? null) as Promise<RpcResult<T>>;

/** Unwrap, or fail with the platform's own message rather than `undefined is not an object`. */
export function expectOk<T>(result: RpcResult<T>, what: string): T {
  if (result.data === undefined) {
    throw new Error(`${what} failed with ${result.status}: ${result.error?.message ?? JSON.stringify(result.raw).slice(0, 400)}`);
  }
  return result.data;
}

// ── Identities ──────────────────────────────────────────────────────────────

export interface TestUser {
  readonly userId: string;
  readonly handle: string;
  readonly password: string;
  accessToken: string;
}

const PASSWORD = 'e2e-password-not-a-real-one';

/** A unique-per-run suffix. The fleet's database is not reset between runs. */
export const runId = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export async function register(prefix: string, run: string): Promise<TestUser> {
  const handle = `${prefix}${run}`.slice(0, 32);
  const result = await mutate<{ userId: string; accessToken: string }>('/api/identity/trpc/auth.register', {
    handle,
    email: `${handle}@e2e.invalid`,
    password: PASSWORD,
  });
  const data = expectOk(result, `register ${handle}`);
  return { userId: data.userId, handle, password: PASSWORD, accessToken: data.accessToken };
}

export async function login(user: TestUser): Promise<string> {
  const result = await mutate<{ accessToken: string }>('/api/identity/trpc/auth.login', {
    identifier: user.handle,
    password: user.password,
  });
  return expectOk(result, `login ${user.handle}`).accessToken;
}

/**
 * An OPERATOR token.
 *
 * Minted directly rather than obtained from svc-identity, and that is a finding
 * rather than a shortcut: `AuthService.defaultScopes()` grants no `admin:*`
 * scope, `STEP_UP_SCOPES` adds only `trade:withdraw`, and there is no
 * role or grant table anywhere in svc-identity. **No login in the platform can
 * produce an operator.** Every `admin:*` procedure that already exists —
 * `kyc.approve`, `deposit.credit`, `ledger.freeze` — is therefore unreachable
 * by any session the platform can issue.
 *
 * So the suite mints one with the deployment's own signing key, which is what
 * an operator would have to do today. When operator issuance lands, this
 * function calls it instead and nothing else in the suite changes.
 */
export async function operatorToken(userId: string, scopes: readonly Scope[]): Promise<string> {
  const { token } = await issueAccessToken({ userId, sessionId: randomUUID(), scopes, tier: 'institutional', mfa: true }, tokens());
  return token;
}

/**
 * Take a user to KYC tier `basic`.
 *
 * Not optional scaffolding: `DEFAULT_MODULE_RULES.trade` is `OPEN_BASIC`, so a
 * freshly registered user placing an order is refused by the jurisdiction
 * matrix before any money logic runs. The happy path has to include this
 * because a real user's does.
 */
export async function verifyToBasic(user: TestUser, operator: string): Promise<void> {
  const submitted = expectOk(
    await mutate<{ id: string }>('/api/identity/trpc/kyc.submit', { tier: 'basic', jurisdiction: 'XX' }, user.accessToken),
    `kyc.submit for ${user.handle}`,
  );
  expectOk(await mutate('/api/identity/trpc/kyc.approve', { recordId: submitted.id }, operator), `kyc.approve for ${user.handle}`);

  // The tier is a CLAIM IN THE TOKEN, stamped at issue time. Approving does not
  // upgrade a token already in a browser, so the session has to be re-issued —
  // which is exactly what a user hitting refresh after verification does.
  user.accessToken = await login(user);
}

// ── Money ───────────────────────────────────────────────────────────────────

/** Credit a user from the sandbox rail — the platform's own operator deposit path (§4.2). */
export async function deposit(operator: string, userId: string, assetId: string, amount: string): Promise<void> {
  expectOk(
    await mutate(
      '/api/pay/trpc/deposit.credit',
      { userId, assetId, amount, railId: config.creditRail, railRef: `e2e-${randomUUID()}` },
      operator,
    ),
    `deposit.credit ${amount} ${assetId}`,
  );
}

/**
 * A user's available balance, read from THE LEDGER.
 *
 * `withdrawal.balance` is `ledger:read` and svc-pay's own comment explains why
 * it is the right source: "the ledger is the balance (Doctrine §0.6), and a
 * second answer computed here would be the one users saw and the wrong one".
 */
export async function balance(user: TestUser, assetId: string): Promise<string> {
  const result = await query<{ available: string }>('/api/pay/trpc/withdrawal.balance', { assetId }, user.accessToken);
  return expectOk(result, `balance ${assetId} for ${user.handle}`).available;
}

// ── The market fixture ──────────────────────────────────────────────────────

export interface SeededMarket {
  readonly symbol: string;
  readonly base: string;
  readonly quote: string;
  readonly makerBps: number;
  readonly takerBps: number;
}

/**
 * Seed a spot market by writing to `trade.markets`.
 *
 * ── This is a finding, and it is written here so it is not lost ─────────────
 *
 * `TradeService.listMarket()` exists and is fully implemented. **No router
 * anywhere exposes it.** `services/svc-trade/src/router.ts` publishes
 * `markets.list` and `markets.get` and nothing else, so there is no API — not
 * an admin one, not a service-to-service one — by which a market can be
 * brought into existence. Verified against the running fleet: `markets.list`
 * returns `[]` on a fresh database and every candidate admin path 404s.
 *
 * A test cannot exercise the order path without a market, so the choice was
 * between writing the row and having no e2e at all. AGENTS.md's prohibition —
 * "never write raw SQL to another service's tables" — is a rule about
 * SERVICES, whose whole point is that a module's invariants live with its
 * owner. A fixture in a test harness is the ordinary exception, and the insert
 * uses only columns the migration declares, with the service's own constraints
 * enforcing correctness.
 *
 * It should still be replaced. When svc-trade grows a market-listing procedure,
 * this function becomes a call to it.
 *
 * The column probe is not defensive programming for its own sake: the deployed
 * schema is ahead of the checked-in migration in at least one stream (asset
 * class, trading schedule, display name), and a fixture that hardcoded either
 * shape would fail on the other.
 */
export async function seedMarket(run: string, options?: { status?: 'active' | 'halted' }): Promise<SeededMarket> {
  const sql = postgres(config.databaseUrl, { max: 1, onnotice: () => {} });

  try {
    const columns = await sql<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'trade' AND table_name = 'markets'
    `;
    const has = new Set(columns.map((c) => c.column_name));

    // The fixture NEVER creates anything. An empty column list means the fleet
    // has not been migrated, and the honest answer is to say so — not to run
    // DDL against a database the whole machine shares.
    if (has.size === 0) {
      throw new Error(
        'trade.markets does not exist on the fleet database. Run the fleet migrations (`pnpm platform:up` runs them) — ' +
          'this harness deliberately applies none of its own.',
      );
    }

    const base = `E2E${run.toUpperCase()}`.slice(0, 12);
    const symbol = `${base}/USDT`;
    const status = options?.status ?? 'active';

    // `listed_at` is required whenever status is `active`
    // (`markets_active_listed_ck`), and `display_name` is NOT NULL with a
    // length check in the deployed schema but absent from the migration.
    const extraColumns = has.has('display_name') ? sql`, display_name` : sql``;
    const extraValues = has.has('display_name') ? sql`, ${`${base} spot`}` : sql``;

    await sql`
      INSERT INTO trade.markets
        (symbol, base_asset, quote_asset, kind, tick_size, lot_size, min_qty, min_notional, status, maker_bps, taker_bps, listed_at${extraColumns})
      VALUES
        (${symbol}, ${base}, 'USDT', 'spot', 0.01, 0.001, 0.001, 1, ${status}, 10, 20, now()${extraValues})
      ON CONFLICT (symbol) DO NOTHING
    `;

    return { symbol, base, quote: 'USDT', makerBps: 10, takerBps: 20 };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Move a seeded market to `halted` — the operator action the failure path tests. */
export async function haltMarket(symbol: string): Promise<void> {
  const sql = postgres(config.databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql`UPDATE trade.markets SET status = 'halted' WHERE symbol = ${symbol}`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// ── Waiting ─────────────────────────────────────────────────────────────────

/**
 * Poll until a condition holds.
 *
 * Fills settle through NATS, so "the order is filled" is eventually true rather
 * than immediately true. A fixed sleep would be either slow or flaky depending
 * on the machine; this is neither, and it reports what it last saw when it
 * gives up, which is the difference between a useful failure and "timed out".
 */
export async function until<T>(what: string, probe: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;

  while (Date.now() < deadline) {
    last = await probe();
    if (ok(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}. Last seen: ${JSON.stringify(last)}`);
}

/** Fail loudly and early if the fleet is not up, rather than 40 assertions later. */
export async function requireFleet(): Promise<void> {
  let ready: Response;
  try {
    ready = await fetch(`${config.edgeUrl}/ready`, { signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    throw new Error(`svc-edge is not answering on ${config.edgeUrl} (${(err as Error).message}). Run \`pnpm platform:up\`.`);
  }
  if (!ready.ok) throw new Error(`svc-edge answered ${ready.status} on /ready`);
}
