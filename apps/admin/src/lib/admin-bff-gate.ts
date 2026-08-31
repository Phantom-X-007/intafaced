import { timingSafeEqual } from 'node:crypto';

/**
 * Fail-closed gate for every apps/admin BFF route.
 *
 * This is a deployment boundary, not operator SSO: the credential normally
 * arrives from the authenticated reverse proxy and never from browser code.
 * Until the console has a first-class operator session, an absent credential
 * must make the BFF unavailable. A network ACL is not an authentication
 * fallback and blank configuration must never weaken this boundary.
 *
 * Header: `x-intafaced-admin-bff: <secret>`
 */

const GATE_HEADER = 'x-intafaced-admin-bff';

function credentialsMatch(got: string, expected: string): boolean {
  const gotBytes = Buffer.from(got);
  const expectedBytes = Buffer.from(expected);
  return gotBytes.length === expectedBytes.length && timingSafeEqual(gotBytes, expectedBytes);
}

function refusesCrossOriginMutation(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return false;

  // Fetch Metadata is authoritative when the browser supplies it. The Origin
  // comparison also protects older browsers and reverse proxies which omit it.
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') return true;
  const origin = request.headers.get('origin');
  if (!origin) return false; // non-browser operator/proxy call

  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

export function adminBffGate(request: Request): Response | null {
  const secret = process.env.ADMIN_BFF_SHARED_SECRET?.trim();
  if (!secret) {
    return Response.json(
      {
        error: 'admin BFF unavailable — ADMIN_BFF_SHARED_SECRET is not configured',
        code: 'admin.bff_gate_unconfigured',
      },
      { status: 503 },
    );
  }

  const got = request.headers.get(GATE_HEADER)?.trim() ?? '';
  if (!credentialsMatch(got, secret)) {
    return Response.json(
      {
        error: `admin BFF gate refused — ${GATE_HEADER} is missing or invalid`,
        code: 'admin.bff_gate',
      },
      { status: 401 },
    );
  }

  if (refusesCrossOriginMutation(request)) {
    return Response.json(
      {
        error: 'admin BFF gate refused a cross-origin mutation',
        code: 'admin.bff_gate_origin',
      },
      { status: 403 },
    );
  }

  return null;
}
