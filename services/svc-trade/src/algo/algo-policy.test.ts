/**
 * Unit card — consolidated trade.algo policy honesty door
 * 1. Promise: TWAP product path, jobs default OFF, cancel_incomplete park, VWAP/POV immature refuse
 * 2. Break: describeAlgoPolicy omits capability or cancel / volume immature law
 * 3. Done bar: router mounts algo.policy → describeAlgoPolicy()
 * 4. Class N
 * 5. Paths: svc-trade/src/algo/algo-policy.ts, router.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { presentAlgoCapabilityNote } from './algo-capability.js';
import {
  ALGO_CANCEL_INCOMPLETE_CODE,
  ALGO_CANCEL_INCOMPLETE_HALT,
  ALGO_IMMATURE_KINDS,
  ALGO_PRODUCT_KIND,
  ALGO_VOLUME_IMMATURE_CODE,
  describeAlgoPolicy,
} from './algo-policy.js';

const here = dirname(fileURLToPath(import.meta.url));
const routerSource = readFileSync(join(here, '..', 'router.ts'), 'utf8');

describe('describeAlgoPolicy — trade.algo honesty door', () => {
  it('states TWAP schedule law with jobs default OFF and cancel_incomplete park', () => {
    const policy = describeAlgoPolicy();
    expect(policy.productKind).toBe(ALGO_PRODUCT_KIND);
    expect(policy.capability).toEqual(presentAlgoCapabilityNote({}));
    expect(policy.capability.jobsDefault).toBe(false);
    expect(policy.capability.jobsEnabled).toBe(false);
    expect(policy.capability.createEnabled).toBe(true);
    expect(policy.capability.icebergs).toBe('out');
    expect(policy.parentHoldsNoBalance).toBe(true);
    expect(policy.progressFromChildFillsOnly).toBe(true);
    expect(policy.cancelIncompleteHalt).toBe(ALGO_CANCEL_INCOMPLETE_HALT);
    expect(policy.cancelIncompleteCode).toBe(ALGO_CANCEL_INCOMPLETE_CODE);
    expect(policy.resumeRefusedOnCancelIncomplete).toBe(true);
    expect(policy.vwapPovImmatureRefused).toBe(true);
    expect(policy.volumeImmatureCode).toBe(ALGO_VOLUME_IMMATURE_CODE);
    expect(policy.immatureKinds).toEqual(ALGO_IMMATURE_KINDS);
    expect(policy.inventsParentFill).toBe(false);
    expect(policy.inventsVwapCurve).toBe(false);
    expect(policy.inventsPovVolume).toBe(false);
    expect(policy.moneyViaLedgerClientOnly).toBe(true);
    expect(JSON.stringify(policy)).not.toMatch(/filledQty|avgPrice|holdAmount|pnl/);
  });

  it('reflects explicit capability flags when provided', () => {
    const policy = describeAlgoPolicy({ createEnabled: false, jobsEnabled: true });
    expect(policy.capability.createEnabled).toBe(false);
    expect(policy.capability.jobsEnabled).toBe(true);
    expect(policy.capability.jobsDefault).toBe(false);
  });
});

describe('algo.policy route (trade.algo honesty door)', () => {
  it('router mounts describeAlgoPolicy on algo.policy', () => {
    expect(routerSource).toMatch(/policy:\s*publicProcedure\.query\(\(\)\s*=>\s*describeAlgoPolicy\(\)\)/);
  });
});
