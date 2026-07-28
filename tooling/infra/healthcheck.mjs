#!/usr/bin/env node
/**
 * Container healthcheck.
 *
 * A file rather than an inline `CMD-SHELL` string because the inline version
 * has to be escaped through YAML, then through sh, then through `node -e`, and
 * the result is unreadable and unreviewable. It also cannot carry a comment,
 * and the two decisions below both need one.
 *
 * Decision 1 — it probes `/health`, never `/ready`.
 *   Compose's `depends_on: condition: service_healthy` gates STARTUP. Several
 *   services return 503 from `/ready` for reasons that are correct and
 *   operational rather than broken: svc-ledger when posting is frozen (§4.2),
 *   svc-matching when the engine kill-switch is off, svc-trade when
 *   `trade.spot` is off. Gating startup on `/ready` would mean an operator who
 *   halts the market cannot bring the platform back up — the kill-switch would
 *   become a boot failure. `/health` answers "this process is alive and its
 *   dependencies are wired", which is the question compose is actually asking.
 *
 * Decision 2 — 127.0.0.1, not localhost.
 *   Node 18+ resolves `localhost` to ::1 first. Fastify binds 0.0.0.0 (IPv4).
 *   In a container with IPv6 present, `localhost` intermittently fails against
 *   a server that is up.
 *
 * Env:
 *   HEALTHCHECK_PORT  overrides — the Next apps take their port from a CLI flag
 *   HTTP_PORT         every Fastify service
 *   HEALTHCHECK_PATH  defaults to /health; the Next apps use /
 */

const port = process.env.HEALTHCHECK_PORT ?? process.env.HTTP_PORT ?? process.env.PORT ?? '3000';
const path = process.env.HEALTHCHECK_PATH ?? '/health';
const url = `http://127.0.0.1:${port}${path}`;

// Shorter than the compose `timeout:` so the failure is ours and legible,
// rather than docker killing the probe with no output.
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 3_000);

try {
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok) {
    console.error(`${url} -> ${response.status}`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`${url} -> ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}
