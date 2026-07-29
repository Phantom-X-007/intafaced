import { isModuleId } from '@intafaced/config';
import { readKillSwitches, setKillSwitch } from '@/lib/kill-switch-client';

/**
 * The console's own kill-switch endpoint (§14.6).
 *
 * A thin server-side hop, and the thinness is the point:
 *
 *   · The operator credential stays on the server. A board that called
 *     `svc-edge` from the browser would have to ship `ADMIN_OPERATOR_TOKEN` to
 *     the browser, and a token carrying `admin:write` in a bundle is a token in
 *     everybody's devtools.
 *   · It gives the e2e suite something to drive that IS the console. §14.6 asks
 *     for a kill-switch "reachable from `apps/admin`", and a test that called
 *     `svc-edge` directly would prove the edge works while proving nothing at
 *     all about this app. `tooling/e2e/src/kill-switch.e2e.ts` posts here, to
 *     the running console, and then watches the platform's behaviour change.
 *
 * No authentication of its own, and that is the console's known gap rather than
 * a new one: `apps/admin/README.md` has said since it was written that this app
 * must sit behind operator SSO before it is deployed anywhere reachable. It is
 * repeated here because this is the first route in the console that can change
 * the platform, so it is the first one where the gap costs something.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = await readKillSwitches();
  return Response.json(state, { status: state.status === 'reachable' ? 200 : 503 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'a JSON body is required' }, { status: 400 });
  }

  const input = body as { module?: unknown; disabled?: unknown; reason?: unknown };

  // Validated here as well as at the edge. The edge is authoritative — it is the
  // thing that enforces the switch — but an operator mis-typing a module id
  // deserves the answer from the surface they are looking at.
  if (typeof input.module !== 'string' || !isModuleId(input.module)) {
    return Response.json({ error: 'module must be a known module id' }, { status: 400 });
  }
  if (typeof input.disabled !== 'boolean') {
    return Response.json({ error: 'disabled must be a boolean' }, { status: 400 });
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 12) {
    return Response.json({ error: 'reason must be at least 12 characters — an outage nobody can explain is worse' }, { status: 400 });
  }

  const result = await setKillSwitch({ module: input.module, disabled: input.disabled, reason: input.reason.trim() });
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
