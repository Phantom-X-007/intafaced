/**
 * Optional gate for apps/admin BFF routes that can change the platform.
 *
 * Residual: the console has no operator SSO. Until SSO lands, operators may set
 * `ADMIN_BFF_SHARED_SECRET` and inject the matching header from a reverse proxy
 * (or local curl). When unset, behavior is unchanged (network ACL only).
 *
 * Header: `x-intafaced-admin-bff: <secret>`
 */

export function adminBffGate(request: Request): Response | null {
  const secret = process.env.ADMIN_BFF_SHARED_SECRET?.trim();
  if (!secret) return null;

  const got = request.headers.get('x-intafaced-admin-bff')?.trim() ?? '';
  if (got === secret) return null;

  return Response.json(
    {
      error: 'admin BFF gate refused — set x-intafaced-admin-bff or unset ADMIN_BFF_SHARED_SECRET',
      code: 'admin.bff_gate',
    },
    { status: 401 },
  );
}
