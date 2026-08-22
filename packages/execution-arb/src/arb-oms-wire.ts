/**
 * execution.arbitrage fleet compose + OMS consumer wiring honesty checks.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function executionComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-execution:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-execution service block missing from docker-compose.apps.yml');
  return match[0];
}

export function edgeComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-edge:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-edge service block missing from docker-compose.apps.yml');
  return match[0];
}

export function executionRouterSource(): string {
  return readFileSync(join(ROOT, 'services/svc-execution/src/router.ts'), 'utf8');
}

export function executionSpineSource(): string {
  return readFileSync(join(ROOT, 'services/svc-execution/src/oms-spine.ts'), 'utf8');
}

export function edgeControlPlaneSource(): string {
  return readFileSync(join(ROOT, 'services/svc-edge/src/control-plane.ts'), 'utf8');
}

export function arbCapitalComposeWired(): boolean {
  const block = executionComposeBlock();
  return /EXECUTION_ARB_MAX_QUOTE_AGE_MS:\s*\$\{EXECUTION_ARB_MAX_QUOTE_AGE_MS:-\}/.test(block);
}

export function arbScanDoorWiredInExecution(): boolean {
  const router = executionRouterSource();
  const spine = executionSpineSource();
  return /arb:\s*router\(/.test(router) && /scanOmsExternalArb/.test(router) && /execution\.arb\.scan/.test(spine);
}

export function arbPlanLegsDoorWiredInExecution(): boolean {
  const router = executionRouterSource();
  const spine = executionSpineSource();
  return /planLegs:\s*/.test(router) && /planOmsArbAtomicLegs/.test(router) && /execution\.arb\.planLegs/.test(spine);
}

export function arbReachableFromEdgeCompose(): boolean {
  const block = edgeComposeBlock();
  return /EXECUTION_URL:\s*http:\/\/svc-execution:4019/.test(block);
}

export function arbScanConsumerDoorOnEdge(): boolean {
  return (
    /registerExecutionArbScanConsumerRoutes/.test(edgeControlPlaneSource()) &&
    /execution-arb-scan-consumer-door/.test(edgeControlPlaneSource())
  );
}

export function arbOmsWireClosed(): boolean {
  return (
    arbCapitalComposeWired() &&
    arbScanDoorWiredInExecution() &&
    arbPlanLegsDoorWiredInExecution() &&
    arbReachableFromEdgeCompose() &&
    arbScanConsumerDoorOnEdge()
  );
}
