import { createTRPCUntypedClient, httpLink, isTRPCClientError } from '@trpc/client';
import type { z } from 'zod';
import { failure, ok, type Failure, type FailureReason, type Result, type ServiceId } from '../result';

/**
 * THE EDGE CLIENT (§9).
 *
 * Everything the browser touches goes through svc-edge, and nothing reaches a
 * service any other way. One base URL, one prefix per service, one place the
 * bearer token is attached — `services/svc-edge/README.md` is the contract:
 *
 *   · `POST|GET {base}/api/<service>/trpc/<procedure>`
 *   · `Authorization: Bearer <accessToken>` — the edge verifies it, exchanges it
 *     for a signed principal header, and **does not forward the token**.
 *   · an unlisted prefix is 404, never a pass-through.
 *
 * ── Why the client is untyped at the transport and typed at the boundary ────
 *
 * A tRPC client normally imports the server's router TYPE. A browser app must
 * not: `services/svc-trade/src/router.ts` pulls in the service, its tables and
 * its ledger client, and §2 is explicit that callers import contracts, never an
 * implementation. So the transport is `createTRPCUntypedClient` (path + input)
 * and every response is parsed by a zod schema on the way out.
 *
 * That is stronger than an imported type, not weaker. An imported type is a
 * compile-time claim about a service that may have been redeployed since; a zod
 * parse is a runtime check on the bytes that actually arrived. When svc-trade
 * changes an output shape, this client returns `invalid-response` and the panel
 * says so — instead of rendering `undefined` as a price.
 *
 * ── Why nothing throws ─────────────────────────────────────────────────────
 *
 * Every method returns `Result`. An unreachable service is an ordinary event in
 * a fleet of twelve, and a terminal that white-screens on one of them is worse
 * than one that greys out a panel.
 */

/** The prefixes svc-edge publishes. Mirrors `services/svc-edge/src/routes.ts`. */
const EDGE_PREFIX: Readonly<Record<ServiceId, string>> = {
  identity: '/api/identity',
  trade: '/api/trade',
  token: '/api/token',
  agents: '/api/agents',
  bank: '/api/bank',
  p2p: '/api/p2p',
  pay: '/api/pay',
  blueprint: '/api/blueprint',
  protocol: '/api/protocol',
};

/**
 * Where the edge is.
 *
 * `NEXT_PUBLIC_` because the browser makes these calls; the value is a public
 * URL and carries no secret. The default is the dev port in
 * `services/svc-edge/src/env.ts`.
 */
export const DEFAULT_EDGE_URL = 'http://localhost:4000';

/**
 * Read at call time, never captured.
 *
 * A token that was copied into a closure at client-construction is the token
 * that is still being sent an hour after the user signed out.
 */
export type TokenSource = () => string | null;

export interface EdgeClientOptions {
  readonly baseUrl?: string;
  readonly token?: TokenSource;
  /** Injected in tests. */
  readonly fetch?: typeof globalThis.fetch;
}

type UntypedClient = ReturnType<typeof createTRPCUntypedClient>;

/**
 * Map a transport error onto the reason a human needs.
 *
 * The distinction that matters most is unreachable vs. refused: one is our
 * fault and the user can only wait, the other is about them and they can act.
 */
function classify(err: unknown, service: ServiceId, path: string): Failure {
  if (isTRPCClientError(err)) {
    const code = err.data?.code;

    // No `data` means no tRPC envelope came back at all — the request never
    // reached a router. Connection refused, DNS, timeout, CORS, or an edge that
    // 404'd the prefix without a body.
    if (code === undefined) {
      return failure(service, path, 'unreachable', err.message || 'no response from the edge');
    }

    const reason: FailureReason =
      code === 'UNAUTHORIZED'
        ? 'unauthenticated'
        : code === 'FORBIDDEN'
          ? 'forbidden'
          : code === 'NOT_FOUND'
            ? 'not-found'
            : code === 'BAD_REQUEST' || code === 'CONFLICT' || code === 'PRECONDITION_FAILED' || code === 'TOO_MANY_REQUESTS'
              ? 'rejected'
              : 'server-error';

    return failure(service, path, reason, err.message);
  }

  if (err instanceof Error) return failure(service, path, 'unreachable', err.message);
  return failure(service, path, 'unreachable', 'unknown transport error');
}

export interface EdgeClient {
  readonly baseUrl: string;
  query<T>(service: ServiceId, path: string, schema: z.ZodType<T>, input?: unknown): Promise<Result<T>>;
  mutate<T>(service: ServiceId, path: string, schema: z.ZodType<T>, input?: unknown): Promise<Result<T>>;
  /** `GET {base}/ready` — the edge's own route table. Not a tRPC call. */
  ready(): Promise<Result<readonly string[]>>;
}

export function createEdgeClient(options: EdgeClientOptions = {}): EdgeClient {
  const baseUrl = (options.baseUrl ?? DEFAULT_EDGE_URL).replace(/\/+$/, '');
  const token = options.token ?? (() => null);
  const fetchImpl = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  // One transport per service: they are different origins' worth of URL, and a
  // batch link must never mix two services into one request.
  const clients = new Map<ServiceId, UntypedClient>();

  function clientFor(service: ServiceId): UntypedClient {
    const existing = clients.get(service);
    if (existing) return existing;

    const created = createTRPCUntypedClient({
      links: [
        httpLink({
          url: `${baseUrl}${EDGE_PREFIX[service]}/trpc`,
          fetch: fetchImpl,
          headers() {
            const bearer = token();
            // Absent, not empty. An `Authorization: Bearer ` header with nothing
            // after it is a malformed header, not an anonymous request.
            return bearer ? { Authorization: `Bearer ${bearer}` } : {};
          },
        }),
      ],
    });

    clients.set(service, created);
    return created;
  }

  async function run<T>(
    kind: 'query' | 'mutation',
    service: ServiceId,
    path: string,
    schema: z.ZodType<T>,
    input?: unknown,
  ): Promise<Result<T>> {
    let raw: unknown;
    try {
      const client = clientFor(service);
      raw = kind === 'query' ? await client.query(path, input) : await client.mutation(path, input);
    } catch (err) {
      return classify(err, service, path);
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'shape mismatch';
      return failure(service, path, 'invalid-response', where);
    }
    return ok(parsed.data);
  }

  return {
    baseUrl,
    query: (service, path, schema, input) => run('query', service, path, schema, input),
    mutate: (service, path, schema, input) => run('mutation', service, path, schema, input),

    async ready() {
      try {
        const res = await fetchImpl(`${baseUrl}/ready`);
        if (!res.ok) return failure('identity', '/ready', 'server-error', `edge answered ${res.status}`);
        const body: unknown = await res.json();
        const routes = (body as { routes?: unknown }).routes;
        if (!Array.isArray(routes) || routes.some((r) => typeof r !== 'string')) {
          return failure('identity', '/ready', 'invalid-response', 'no route table in the edge readiness body');
        }
        return ok(routes as readonly string[]);
      } catch (err) {
        return failure('identity', '/ready', 'unreachable', err instanceof Error ? err.message : 'edge unreachable');
      }
    },
  };
}
