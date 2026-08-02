/**
 * INTAFACED — the sovereign platform client.
 * ----------------------------------------------------------------------------
 * Everything our own services expose reaches the browser through ONE door:
 * svc-edge. Nothing here names a service port, and nothing here talks to a
 * service directly — the dev-server proxy maps `/api/*` onto the edge (see
 * ../../config/index.js), and the edge owns the route table. An unlisted
 * prefix 404s there rather than falling through to the internal network.
 *
 * The services speak tRPC over HTTP. The wire shape is fixed and small:
 *
 *   query     GET  /api/<module>/trpc/<procedure>?input=<url-encoded JSON>
 *   mutation  POST /api/<module>/trpc/<procedure>   body: <JSON input>
 *   success   { "result": { "data": ... } }
 *   failure   { "error": { "message", "data": { "code", "httpStatus", ... } } }
 *
 * ONE EXCEPTION, AND IT IS A CONTRACT NOT A SHORTCUT. svc-trade also publishes
 * a CCXT-shaped REST surface under `/api/v1/*` (svc-edge routes that prefix to
 * the same service with `preservePath: true`). It is not tRPC: the body IS the
 * answer, and a failure is `{ code: <CcxtErrorCode>, message, intafacedCode }`
 * at the top level. `rest()` below speaks it, and `classify` reads both shapes,
 * so the screens keep exactly one client and exactly one failure taxonomy.
 *
 * WHY `fetch` AND NOT `this.$http`. main.js sets `Vue.http.options.emulateJSON`
 * globally, which form-encodes every POST body. tRPC needs a JSON body, and
 * main.js is owned elsewhere, so these calls use the platform's own transport
 * rather than quietly breaking the vendor's.
 *
 * Money never becomes a `number` on this path. Decimal strings arrive as
 * strings and are rendered as strings.
 */

/** Every prefix svc-edge's route table actually serves. Longest prefix wins there. */
export const EDGE_BASE = '/api';

/**
 * The failure taxonomy the screens render.
 *
 * A screen that cannot show data must say WHICH of these it hit, because they
 * mean completely different things to whoever reads the page: "sign in" is a
 * user action, "this scope is issued to nobody" is an engineering gap, and
 * "the router is not mounted" is a different engineering gap again. Collapsing
 * them into one "something went wrong" is how a half-built system starts
 * looking finished.
 */
export const REASON = {
    OK: 'ok',
    /** The edge could not be reached at all, or the upstream was down (502). */
    UNREACHABLE: 'unreachable',
    /** svc-edge has no route for this prefix — the module is not behind the front door. */
    NOT_ROUTED: 'not_routed',
    /** The edge routed it, but the service serves no such path — router not mounted. */
    NOT_MOUNTED: 'not_mounted',
    /** No platform session. */
    UNAUTHORIZED: 'unauthorized',
    /** Signed in, but the session does not carry the scope this procedure demands. */
    SCOPE_DENIED: 'scope_denied',
    /** Signed in and scoped, but the jurisdiction matrix wants a verification tier. */
    TIER_REQUIRED: 'tier_required',
    /** Signed in, scoped, and still refused. */
    FORBIDDEN: 'forbidden',
    /**
     * NO SERVICE EXISTS. Not "down", not "unrouted" — never built.
     *
     * This is the §13 socket reason, and it is deliberately not reached by
     * making a request. The other failures are answers from a system that
     * exists; this one is the absence of the system, and the screen knows it
     * statically. Calling a URL we already know nothing serves, purely to
     * render its 404, would cost a round trip and would misreport a missing
     * capability as a routing fault.
     *
     * Screens that use it MUST pass `noSurfaceReason` so the page says WHICH
     * capability is missing and what would have to exist. See `noSurface()`.
     */
    NO_SURFACE: 'no_surface',
    /**
     * The venue mounts this route on purpose and will not serve it in this
     * shape — CCXT `NotSupported`, HTTP 501. Distinct from NOT_MOUNTED, which
     * is an engineering gap: this one is a deliberate answer and the client
     * should STOP asking. Funding rate on a spot market is the live example.
     */
    NOT_SUPPORTED: 'not_supported',
    /**
     * CCXT `BadSymbol` — the venue lists no such market. Distinct from an empty
     * answer: "BTC/USDT is not listed here" and "BTC/USDT has no orders" are
     * different sentences and only one of them is the reader's problem.
     */
    BAD_SYMBOL: 'bad_symbol',
    /** Anything else the service said no to. */
    ERROR: 'error'
};

function buildUrl(module, procedure, input) {
    var url = EDGE_BASE + '/' + module + '/trpc/' + procedure;
    if (input === undefined || input === null) return url;
    return url + '?input=' + encodeURIComponent(JSON.stringify(input));
}

function headers(token) {
    var h = { 'content-type': 'application/json' };
    // The edge exchanges this bearer for a signed principal the services will
    // believe. Without it every scopedProcedure answers UNAUTHORIZED, which is
    // the correct answer and what the screens will show.
    if (token) h['authorization'] = 'Bearer ' + token;
    return h;
}

/**
 * The CCXT error classes svc-trade puts on the wire (`ccxt-errors.ts`), mapped
 * onto our reason taxonomy.
 *
 * A CCXT client branches on the class to decide whether to retry; a SCREEN
 * branches on it to decide what sentence to print. The two questions have the
 * same answer, so the mapping stays here rather than being re-guessed per page.
 *
 * `ExchangeNotAvailable` / `OnMaintenance` are UNREACHABLE on purpose: from a
 * reader's seat "the matching engine is down" and "the edge is down" are the
 * same fact — the venue cannot tell them anything right now — and both are
 * temporary. What must never collapse into them is an EMPTY book, which is a
 * successful answer and never reaches this function.
 */
var CCXT_REASON = {
    AuthenticationError: REASON.UNAUTHORIZED,
    PermissionDenied: REASON.FORBIDDEN,
    BadSymbol: REASON.BAD_SYMBOL,
    NotSupported: REASON.NOT_SUPPORTED,
    ExchangeNotAvailable: REASON.UNREACHABLE,
    OnMaintenance: REASON.UNREACHABLE,
    RateLimitExceeded: REASON.ERROR,
    InsufficientFunds: REASON.ERROR,
    InvalidOrder: REASON.ERROR,
    OrderNotFound: REASON.ERROR,
    OrderNotFillable: REASON.ERROR,
    BadRequest: REASON.ERROR,
    ExchangeError: REASON.ERROR
};

function classify(status, body) {
    var data = (body && body.error && body.error.data) || {};
    var code = data.code || '';
    var message = (body && body.error && body.error.message) || 'Request failed';

    if (body && body.code === 'edge.no_route') return { reason: REASON.NOT_ROUTED, message: 'svc-edge has no route for this module' };
    if (body && body.code === 'edge.upstream_unavailable') return { reason: REASON.UNREACHABLE, message: 'The service behind the edge did not answer' };

    // CCXT REST failure (`/api/v1/*`). The class is top-level, not nested in
    // `error`, and `intafacedCode` carries our finer-grained reason — a
    // PermissionDenied from the scope gate and one from the jurisdiction matrix
    // are the same class on the wire and different sentences on the page.
    if (body && typeof body.code === 'string' && CCXT_REASON[body.code]) {
        var ccxtMessage = body.message || 'Request failed';
        var reason = CCXT_REASON[body.code];
        if (body.code === 'PermissionDenied') {
            if (body.intafacedCode === 'scope.denied') reason = REASON.SCOPE_DENIED;
            else if (body.intafacedCode === 'tier.insufficient' || body.requiredTier) reason = REASON.TIER_REQUIRED;
        }
        return { reason: reason, message: ccxtMessage };
    }

    // Fastify's own 404 shape, not tRPC's — the service is up and the path is
    // simply not served, which for our routers means the tRPC plugin was never
    // registered.
    if (status === 404 && body && body.error === 'Not Found') return { reason: REASON.NOT_MOUNTED, message: body.message || 'The service does not serve this path' };
    if (code === 'UNAUTHORIZED' || status === 401) return { reason: REASON.UNAUTHORIZED, message: message };
    if (code === 'FORBIDDEN' || status === 403) {
        if (data.intafacedCode === 'scope.denied') return { reason: REASON.SCOPE_DENIED, message: message };
        if (/verification tier/i.test(message)) return { reason: REASON.TIER_REQUIRED, message: message };
        return { reason: REASON.FORBIDDEN, message: message };
    }
    return { reason: REASON.ERROR, message: message };
}

function send(url, options, raw) {
    return fetch(url, options).then(function(res) {
        return res.text().then(function(text) {
            var body = null;
            try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }

            // `raw` is for the handful of plain Fastify routes (a service's own
            // /health), which answer with the object itself rather than tRPC's
            // { result: { data } } envelope.
            if (res.ok && raw) {
                return { ok: true, reason: REASON.OK, status: res.status, data: body };
            }
            if (res.ok && body && body.result) {
                return { ok: true, reason: REASON.OK, status: res.status, data: body.result.data };
            }
            var verdict = classify(res.status, body);
            return { ok: false, reason: verdict.reason, status: res.status, message: verdict.message, data: null };
        });
    }, function() {
        // A rejected fetch is the network, not the service: the dev proxy is
        // missing, the edge is down, or nothing is listening on 4000.
        return { ok: false, reason: REASON.UNREACHABLE, status: 0, message: 'Could not reach svc-edge', data: null };
    });
}

/** A tRPC query. Resolves — never rejects — so screens branch on `reason`. */
export function query(module, procedure, input, token) {
    return send(buildUrl(module, procedure, input), { method: 'GET', headers: headers(token) });
}

/** A tRPC mutation. Same contract. */
export function mutate(module, procedure, input, token) {
    return send(EDGE_BASE + '/' + module + '/trpc/' + procedure, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(input === undefined ? {} : input)
    });
}

/** A plain (non-tRPC) route on a service, e.g. svc-protocol's `/health`. */
export function plain(module, path, token) {
    return send(EDGE_BASE + '/' + module + path, { method: 'GET', headers: headers(token) }, true);
}

/** The CCXT REST base. svc-edge forwards this prefix to svc-trade unchanged. */
export const REST_BASE = EDGE_BASE + '/v1';

/**
 * A call against svc-trade's CCXT REST contract (`/api/v1/...`).
 *
 * Same contract as `query`/`mutate`: it RESOLVES with `{ ok, reason, message,
 * data }` and never rejects, so a screen branches on `reason` instead of
 * wrapping every call in a try/catch that would flatten the taxonomy back into
 * "something went wrong".
 *
 * `raw` is true because this surface answers with the value itself — an array
 * of markets, an order book object — and not tRPC's `{ result: { data } }`.
 *
 * A SUCCESSFUL EMPTY ANSWER IS `ok: true` WITH AN EMPTY ARRAY. That is the
 * distinction the whole trading half of this shell rests on: the books are
 * empty and OHLCV returns `[]` today, and those are answers, not failures. A
 * screen that renders them as a spinner or as a zero is lying about a system
 * that is telling the truth.
 *
 * @param {string} path   e.g. '/markets' or '/orderbook/BTC%2FUSDT'
 * @param {object} [opts] { method, body, token, query }
 */
export function rest(path, opts) {
    var o = opts || {};
    var url = REST_BASE + path;

    if (o.query) {
        var parts = [];
        for (var key in o.query) {
            if (!Object.prototype.hasOwnProperty.call(o.query, key)) continue;
            var value = o.query[key];
            if (value === undefined || value === null || value === '') continue;
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
        }
        if (parts.length) url += '?' + parts.join('&');
    }

    var init = { method: o.method || 'GET', headers: headers(o.token) };
    if (o.body !== undefined) init.body = JSON.stringify(o.body);
    return send(url, init, true);
}

/**
 * Percent-encode a unified symbol for a path segment (`BTC/USDT` → `BTC%2FUSDT`).
 *
 * The slash is the whole reason this exists: unencoded it becomes a path
 * separator and `/api/v1/orderbook/BTC/USDT` reaches a route that does not
 * exist, which surfaces as a 404 that reads like a missing market rather than a
 * malformed URL.
 */
export function symbolPath(symbol) {
    return encodeURIComponent(String(symbol == null ? '' : symbol));
}

/**
 * A §13 SOCKET, in the same shape every other call resolves to.
 *
 * For a capability the vendored shell has a screen for and the platform has no
 * service for. It resolves immediately with `NO_SURFACE` and the supplied
 * reason, so the screen renders a stated absence rather than a spinner that
 * never resolves, a fabricated list, or a request to the dead Java backend —
 * which, with nothing listening, renders as a hang.
 *
 * `message` is shown verbatim under "the service said". Write it as the honest
 * engineering fact: what is missing, and what would have to exist.
 *
 *   this.load('notices', noSurface('No announcements service is behind the edge…'));
 */
export function noSurface(message) {
    return Promise.resolve({
        ok: false,
        reason: REASON.NO_SURFACE,
        status: 0,
        message: message,
        data: null
    });
}

/**
 * The `sub` claim, read from an access token.
 *
 * Two procedures (`token.stakeOf`, `token.accessOf`) take a userId as input
 * rather than reading it from the principal, so the caller has to know its own
 * id. This decodes, it does not verify — the signature is the edge's business,
 * and a browser that lied to itself here would only be shown its own data.
 */
export function subjectOf(token) {
    if (!token) return null;
    var parts = String(token).split('.');
    if (parts.length !== 3) return null;
    try {
        var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4) payload += '=';
        var claims = JSON.parse(decodeURIComponent(escape(window.atob(payload))));
        return claims.sub || null;
    } catch (e) {
        return null;
    }
}

/** Scopes carried by an access token, for the honest "what can this session do" panel. */
export function scopesOf(token) {
    if (!token) return [];
    var parts = String(token).split('.');
    if (parts.length !== 3) return [];
    try {
        var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (payload.length % 4) payload += '=';
        var claims = JSON.parse(decodeURIComponent(escape(window.atob(payload))));
        return claims.scopes || [];
    } catch (e) {
        return [];
    }
}

/**
 * THE MODULE MANIFEST.
 *
 * One row per feature area, and the row states what is TRUE today rather than
 * what is planned. `state` is not decoration — the screens render it, and the
 * hub totals it. Three values, and the difference between them matters:
 *
 *   live      a procedure on this module answers with real data today
 *   partial   the module is behind the edge, but the surface a user wants is refused
 *   absent    there is nothing to call — no route, no mount, or no service
 *
 * Kept beside the client rather than inside a component so the hub and each
 * screen cannot drift into telling the user two different stories.
 *
 * `edge` is the prefix svc-edge actually serves for this module, or null when
 * the edge has no route for it at all. Copy lives in assets/lang/en.js under
 * `intafaced.modules.<key>` — nothing user-facing is written here.
 */
export const MODULES = [
    { key: 'bank', route: '/bank', edge: 'bank', service: 'svc-bank', state: 'partial' },
    { key: 'pay', route: '/pay', edge: 'pay', service: 'svc-pay', state: 'live' },
    { key: 'p2p', route: '/p2p', edge: 'p2p', service: 'svc-p2p', state: 'partial' },
    { key: 'token', route: '/token', edge: 'token', service: 'svc-token', state: 'live' },
    { key: 'agents', route: '/agents', edge: 'agents', service: 'svc-agents', state: 'live' },
    { key: 'blueprint', route: '/blueprint', edge: 'blueprint', service: 'svc-blueprint', state: 'partial' },
    // Router mounted on main (#210/#217). Public health/chainStatus/launch.status answer.
    { key: 'protocol', route: '/protocol', edge: 'protocol', service: 'svc-protocol', state: 'partial' },
    { key: 'dex', route: '/dex', edge: 'dex', service: 'svc-dex', state: 'partial' },
    // Edge route /api/indexer exists on main (#218). Read models need a live chain.
    { key: 'chain', route: '/chain', edge: 'indexer', service: 'svc-indexer', state: 'partial' },
    // svc-academy on main (#208); lobbies need academy:* scopes + fleet.
    { key: 'academy', route: '/academy', edge: 'academy', service: 'svc-academy', state: 'partial' },
    // Token factory status lives on svc-protocol as launch.* (#217) — not a separate svc-launch.
    { key: 'launch', route: '/launch', edge: 'protocol', service: 'svc-protocol', state: 'partial' }
];

export function moduleByKey(key) {
    for (var i = 0; i < MODULES.length; i++) {
        if (MODULES[i].key === key) return MODULES[i];
    }
    return null;
}

export default {
    query: query,
    mutate: mutate,
    plain: plain,
    noSurface: noSurface,
    rest: rest,
    symbolPath: symbolPath,
    REST_BASE: REST_BASE,
    MODULES: MODULES,
    REASON: REASON,
    subjectOf: subjectOf,
    scopesOf: scopesOf,
    moduleByKey: moduleByKey
};
