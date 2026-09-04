#!/usr/bin/env node
/**
 * §19.7.6 real-HTTP assertion (CLASS: TRUTH).
 *
 * Hits a live Next listener. Does not render RouteBoundary in-process — that
 * coverage lives in vitest. Missing path must be not-found; a thrown render
 * must keep the operator shell.
 *
 * Running this file alone must fail (no foreign default port).
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MISSING_PATH = '/this-operator-route-does-not-exist';
export const CRASH_PATH = '/route-probe/crash';

const INVENTED_QUEUE = ['adm-queue-table', 'pending KYC', 'empty pending queue', 'Users · pending KYC'];

function fail(msg) {
  throw new Error(msg);
}

function requireBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    fail('ADMIN_ROUTE_BOUNDARIES_HARNESS_URL is required — this spec hits a real HTTP listener, not RouteBoundary in-process');
  }
  return baseUrl;
}

async function get(baseUrl, path) {
  const url = new URL(path, baseUrl).href;
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { url, status: res.status, text };
}

function assertNoInventedQueue(text, label) {
  for (const needle of INVENTED_QUEUE) {
    if (text.includes(needle)) fail(`${label} invented queue chrome ${JSON.stringify(needle)}`);
  }
}

export async function assertMissingPathNotFound(baseUrl) {
  const { url, status, text } = await get(requireBaseUrl(baseUrl), MISSING_PATH);
  if (status !== 404) fail(`expected HTTP 404 for missing path, got ${status} ${url} body=${text.slice(0, 300)}`);
  if (!text.includes('data-route-boundary="not-found"')) {
    fail(`missing path did not render not-found boundary: ${url} body=${text.slice(0, 400)}`);
  }
  if (!text.includes('This operator route does not exist')) {
    fail(`missing path copy was not not-found: ${url}`);
  }
  if (text.includes('data-route-boundary="error"')) fail(`missing path rendered as error: ${url}`);
  if (!text.includes('Operator Console')) fail(`missing path dropped the operator shell: ${url}`);
  assertNoInventedQueue(text, 'missing path');
  return { status, url };
}

export async function assertThrownRenderErrorIsolated(baseUrl) {
  const { url, status, text } = await get(requireBaseUrl(baseUrl), CRASH_PATH);
  // Next streams error.tsx as a client recovery over a page-slot digest.
  // Isolation is the operator shell remaining while the page slot is an error,
  // not a 404 empty queue.
  if (status === 404) fail(`crash probe returned not-found 404: ${url}`);
  if (!text.includes('Operator Console')) fail(`crash probe took down the operator shell: ${url}`);
  if (!text.includes('Kill-switches')) fail(`crash probe dropped operator nav: ${url}`);
  if (!text.includes('adm-shell')) fail(`crash probe dropped adm-shell: ${url}`);
  const pageSlotIsError =
    text.includes('data-route-boundary="error"') || text.includes('This screen failed to render') || text.includes('data-dgst');
  if (!pageSlotIsError) {
    fail(`crash probe did not isolate an error in the page slot: ${url} HTTP ${status} body=${text.slice(0, 400)}`);
  }
  if (text.includes('This operator route does not exist')) fail(`crash probe rendered as not-found: ${url}`);
  if (text.includes('data-route-boundary="not-found"')) fail(`crash probe rendered not-found boundary: ${url}`);
  assertNoInventedQueue(text, 'crash probe');
  return { url, status };
}

function isMain() {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
  return self === invoked;
}

if (isMain()) {
  try {
    const base = process.env.ADMIN_ROUTE_BOUNDARIES_HARNESS_URL;
    const missing = await assertMissingPathNotFound(base);
    const crash = await assertThrownRenderErrorIsolated(base);
    console.log(`ok: GET ${missing.url} → ${missing.status} not-found`);
    console.log(`ok: GET ${crash.url} → error isolated`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
