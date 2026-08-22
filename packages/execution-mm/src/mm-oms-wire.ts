/**
 * execution.market-making OMS wire — svc-execution mm doors + edge EXECUTION_URL.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function executionRouterSource(): string {
  return readFileSync(join(ROOT, 'services/svc-execution/src/router.ts'), 'utf8');
}

export function executionSpineSource(): string {
  return readFileSync(join(ROOT, 'services/svc-execution/src/oms-spine.ts'), 'utf8');
}

export function edgeComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-edge:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-edge service block missing from docker-compose.apps.yml');
  return match[0];
}

export function mmOmsDoorsWiredInExecution(): boolean {
  const router = executionRouterSource();
  const spine = executionSpineSource();
  return (
    /mm:\s*router\(/.test(router) &&
    /quoteOmsExternalMm/.test(router) &&
    /planOmsExternalMmHedge/.test(router) &&
    /execution\.mm\.quote/.test(spine) &&
    /execution\.mm\.hedge/.test(spine)
  );
}

export function mmOmsReachableFromEdgeCompose(): boolean {
  const block = edgeComposeBlock();
  return /EXECUTION_URL:\s*http:\/\/svc-execution:4019/.test(block);
}

export function mmOmsWireClosed(): boolean {
  return mmOmsDoorsWiredInExecution() && mmOmsReachableFromEdgeCompose();
}
