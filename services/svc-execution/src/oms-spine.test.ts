import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeExecutionSpine, EXECUTION_SPINE_DOORS } from './oms-spine.js';

const here = dirname(fileURLToPath(import.meta.url));
const routerSource = readFileSync(join(here, 'router.ts'), 'utf8');

describe('describeExecutionSpine — execution.sor spine catalog', () => {
  it('lists OMS plan, arb scan, and MM doors', () => {
    const spine = describeExecutionSpine();
    expect(spine.externalOnly).toBe(true);
    expect(spine.houseInternalRefuse).toBe(true);
    expect(spine.doors.map((d) => d.id)).toEqual(EXECUTION_SPINE_DOORS.map((d) => d.id));
    expect(spine.doors.every((d) => d.inventsQuotes === false)).toBe(true);
  });

  it('execute door requires caller submit map', () => {
    const execute = describeExecutionSpine().doors.find((d) => d.id === 'execution.oms.execute');
    expect(execute?.callerSubmit).toBe(true);
    expect(execute?.module).toBe('execution.sor');
  });
});

describe('execution.policy route (execution spine honesty door)', () => {
  it('router mounts describeExecutionSpine on execution.policy', () => {
    expect(routerSource).toMatch(/policy:\s*publicProcedure\.query\(\(\)\s*=>\s*describeExecutionSpine\(\)\)/);
  });
});
