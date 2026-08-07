import { queryWarehouseSurface, type CubeFactRow, type WarehouseSurfaceResult } from '@intafaced/contracts';
import { adminBffGate } from '@/lib/admin-bff-gate';

/**
 * Admin read path for ops.analytics Stage-1 warehouse surface (Class N).
 *
 * Honest empty/lag only — never invents trading volume. Fixture facts may be
 * POSTed for operator dry-runs; production wires replica lag via env.
 *
 * Law: docs/adr/2026-08-07-ops-analytics-warehouse-read-replica.md
 * TRK residual: "Admin or BI tool read path" without claiming ETL is live.
 */

export const dynamic = 'force-dynamic';

function replicaConfigured(): boolean {
  // Explicit opt-in. Unset → surface says unavailable, never fabricates KPIs.
  return process.env.ANALYTICS_REPLICA_CONFIGURED === 'true';
}

function lagSeconds(): number | null {
  const raw = process.env.ANALYTICS_REPLICA_LAG_SECONDS;
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseFacts(body: unknown): readonly CubeFactRow[] | null {
  if (body == null || typeof body !== 'object') return null;
  const facts = (body as { facts?: unknown }).facts;
  if (!Array.isArray(facts)) return null;
  return facts as CubeFactRow[];
}

function surfaceResponse(result: WarehouseSurfaceResult): Response {
  const status = result.status === 'ok' ? 200 : result.status === 'empty' ? 200 : result.status === 'refuse' ? 400 : 503;
  return Response.json(result, { status });
}

/**
 * GET — warehouse status with env-configured replica posture and no facts
 * (honest empty / unavailable). Never invents volume series.
 */
export async function GET(request: Request) {
  const gate = adminBffGate(request);
  if (gate) return gate;

  const result = queryWarehouseSurface({
    replicaConfigured: replicaConfigured(),
    lagSeconds: lagSeconds(),
    facts: [],
  });
  return surfaceResponse(result);
}

/**
 * POST — same surface, optional fixture facts for operator dry-run.
 * Body: `{ "facts": CubeFactRow[] }`. Empty/missing facts → empty, not invent.
 */
export async function POST(request: Request) {
  const gate = adminBffGate(request);
  if (gate) return gate;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const facts = parseFacts(body) ?? [];
  const result = queryWarehouseSurface({
    replicaConfigured: replicaConfigured(),
    lagSeconds: lagSeconds(),
    facts,
  });
  return surfaceResponse(result);
}
