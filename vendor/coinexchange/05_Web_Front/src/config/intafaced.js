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

function classify(status, body) {
    var data = (body && body.error && body.error.data) || {};
    var code = data.code || '';
    var message = (body && body.error && body.error.message) || 'Request failed';

    if (body && body.code === 'edge.no_route') return { reason: REASON.NOT_ROUTED, message: 'svc-edge has no route for this module' };
    if (body && body.code === 'edge.upstream_unavailable') return { reason: REASON.UNREACHABLE, message: 'The service behind the edge did not answer' };
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

export default { query: query, mutate: mutate, plain: plain, MODULES: MODULES, REASON: REASON, subjectOf: subjectOf, scopesOf: scopesOf, moduleByKey: moduleByKey };
