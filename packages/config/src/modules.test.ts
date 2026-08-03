import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULES, protocolPlaneOnlyModules } from './modules.js';

/**
 * THE CUSTODY BOUNDARY IS ONLY ENFORCED WHERE THE SCANNER LOOKS.
 *
 * `tooling/ci/custody-scan.mjs` is what makes Doctrine §16.10 ("provably
 * non-custodial or it doesn't merge") true rather than aspirational. It walks a
 * list of Protocol Plane services and fails the build if any of them imports the
 * ledger's write surface.
 *
 * That list is a HARDCODED ARRAY whose own comment says it "Mirrors
 * packages/config/src/modules.ts" — and until this test existed, nothing checked
 * that it did. A mirror nobody checks is a mirror that drifts, and the drift is
 * silent in the worst possible direction: add a Protocol Plane service to
 * `modules.ts` and forget the array, and the new service is simply never
 * scanned. It does not fail. It reports clean, because a service the scanner
 * never opens cannot produce a violation.
 *
 * The scanner is a `.mjs` CI script that runs before anything is built, so it
 * cannot import this TypeScript module. Reading its source and comparing is the
 * cheap way to keep the two honest without restructuring the build.
 *
 * Verified 2026-08-03: the list was correct — svc-dex is in it and custody-scan
 * genuinely covers it. It was correct by luck, not by construction.
 */
describe('custody-scan covers every Protocol Plane service', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scanPath = resolve(here, '../../../tooling/ci/custody-scan.mjs');

  /** The array literal the scanner actually iterates. */
  function servicesInScanner(): string[] {
    const source = readFileSync(scanPath, 'utf8');
    const match = /const PROTOCOL_PLANE_SERVICES\s*=\s*\[([^\]]*)\]/.exec(source);
    if (!match) throw new Error('PROTOCOL_PLANE_SERVICES not found in custody-scan.mjs — the guard below is no longer guarding anything');
    return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!).sort();
  }

  it('scans exactly the services modules.ts declares protocol-only', () => {
    const declared = protocolPlaneOnlyModules()
      .map((m) => m.service)
      .sort();

    expect(servicesInScanner()).toEqual(declared);
  });

  it('never scans a custodial service, and never skips a non-custodial one', () => {
    const scanned = new Set(servicesInScanner());

    for (const mod of Object.values(MODULES)) {
      const protocolOnly = mod.planes.length === 1 && mod.planes[0] === 'protocol';
      // svc-bridge is the deliberate exception the scanner's own header names:
      // it debits the ledger and credits the chain, and is custodial by design
      // (§17.3). It is on both planes, so `protocolOnly` is already false.
      if (protocolOnly) {
        expect(mod.custodial, `${mod.service} is protocol-plane-only and must not be custodial`).toBe(false);
        expect(scanned.has(mod.service), `${mod.service} is a Protocol Plane service that custody-scan never opens`).toBe(true);
      } else {
        expect(scanned.has(mod.service), `${mod.service} is not protocol-plane-only but custody-scan treats it as one`).toBe(false);
      }
    }
  });
});

/**
 * §17.5 — svc-dex is the Protocol Plane's front door, so its plane and custody
 * flags are load-bearing rather than descriptive. `checkAccess` reads exactly
 * these two fields to decide whether to short-circuit to
 * `allowed.permissionless`; flip either and every `dex` procedure silently
 * acquires a KYC tier gate it was designed never to have.
 */
describe('svc-dex sits on the Protocol Plane', () => {
  it('is protocol-plane-only and non-custodial', () => {
    expect(MODULES.dex.planes).toEqual(['protocol']);
    expect(MODULES.dex.custodial).toBe(false);
    expect(MODULES.dex.service).toBe('svc-dex');
  });

  it('is therefore in the set custody-scan must cover', () => {
    expect(protocolPlaneOnlyModules().map((m) => m.service)).toContain('svc-dex');
  });
});
