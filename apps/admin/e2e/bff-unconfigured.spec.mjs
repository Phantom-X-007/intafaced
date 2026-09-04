#!/usr/bin/env node
/**
 * §19.7.6 real-HTTP assertion (CLASS: TRUTH).
 *
 * Hits GET /api/kill-switch on a live listener. Does not call adminBffGate()
 * in-process — that coverage already lives in vitest.
 *
 * The harness boots Next with ADMIN_BFF_SHARED_SECRET unset and sets
 * ADMIN_BFF_HARNESS_URL. Running this file alone must fail (no foreign
 * default port, no in-process shortcut).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UNCONFIGURED_CODE = 'admin.bff_gate_unconfigured';

export async function assertBffUnconfigured(baseUrl) {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new Error('ADMIN_BFF_HARNESS_URL is required — this spec hits a real HTTP listener, not adminBffGate() in-process');
  }

  const url = new URL('/api/kill-switch', baseUrl).href;
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`expected JSON, got HTTP ${res.status}: ${text.slice(0, 240)}`);
  }
  if (res.status !== 503) {
    throw new Error(`expected HTTP 503, got ${res.status} body=${text.slice(0, 300)}`);
  }
  if (body?.code !== UNCONFIGURED_CODE) {
    throw new Error(`expected code ${UNCONFIGURED_CODE}, got ${JSON.stringify(body)}`);
  }
  return { status: res.status, code: body.code, url };
}

function isMain() {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
  return self === invoked;
}

if (isMain()) {
  try {
    const result = await assertBffUnconfigured(process.env.ADMIN_BFF_HARNESS_URL);
    console.log(`ok: GET ${result.url} → ${result.status} ${result.code}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
