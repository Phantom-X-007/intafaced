/**
 * Unit card (W11 L10):
 * Promise: README kill-switch — `agent_definitions.enabled = false` stops
 *   new sessions for that agent.
 * Break: `registerAgent` ON CONFLICT rewrote `enabled = EXCLUDED.enabled`, and
 *   boot always upserts with enabled=true, so an operator kill died on redeploy.
 * Done bar: conflict path updates guardrail/version only; disabled agent stays
 *   disabled across boot re-register; openSession still refuses when disabled.
 * Class: N (ops honesty — no money path).
 * Paths: runtime.registerAgent · fleet/boot-register · this pin.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('kill-switch enabled preserve (W11 L10)', () => {
  it('registerAgent conflict path does not overwrite enabled', () => {
    const src = readFileSync(join(here, '..', 'runtime.ts'), 'utf8');
    // Include the JSDoc above registerAgent (kill-switch contract lives there).
    const doc = src.indexOf('/**\n   * Upsert a guardrail into `agent_definitions`.');
    const start = doc >= 0 ? doc : src.indexOf('async registerAgent(');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('async agentDefinition(', start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);

    expect(body).toMatch(/ON CONFLICT \(agent_id\) DO UPDATE/);
    expect(body).toMatch(/SET version = EXCLUDED\.version/);
    expect(body).toMatch(/guardrail = EXCLUDED\.guardrail/);
    // The kill-switch lie: re-asserting the factory snapshot must not flip
    // enabled back on. Insert still seeds enabled; conflict must not.
    expect(body).not.toMatch(/enabled\s*=\s*EXCLUDED\.enabled/);
    expect(body).toMatch(/enabled` is preserved|preserves `enabled`|Preserve existing `enabled`/i);
  });

  it('boot-register documents that re-boot must not re-enable a kill', () => {
    const src = readFileSync(join(here, 'boot-register.ts'), 'utf8');
    expect(src).toMatch(/must \*\*not\*\* re-enable|must not re-enable|preserves `enabled`/i);
  });
});
