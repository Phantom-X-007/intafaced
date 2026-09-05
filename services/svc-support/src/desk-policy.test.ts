import { describe, expect, it } from 'vitest';
import { IDENTITY_GROUNDING_UNPROBED, IDENTITY_GROUNDING_UNWIRED } from './identity-grounding-honesty.js';
import { QUEUE_TIMING_KIND } from './sla-honesty.js';
import { describeSupportDeskPolicy } from './desk-policy.js';

describe('describeSupportDeskPolicy — ops.support honesty door', () => {
  it('reports desk vs agent split and score-not-promise queue timing', () => {
    const policy = describeSupportDeskPolicy('secret');
    expect(policy.split.deskMountain).toBe('ops.support');
    expect(policy.split.agentAssist).toBe('agents.support');
    expect(policy.split.deskStandalone).toBe(true);
    expect(policy.queue.timingKind).toBe(QUEUE_TIMING_KIND);
    expect(policy.queue.sla).toBe(false);
    expect(policy.identityGrounding).toEqual({ status: 'configured', code: IDENTITY_GROUNDING_UNPROBED });
    expect(policy.settlement.canSettle).toBe(false);
    expect(policy.settlement.canCiteArticles).toBe(true);
    expect(policy.settlement.refuse).toBe('support.settle.refused');
  });

  it('names identity_grounding_unwired when S2S secret is blank', () => {
    const policy = describeSupportDeskPolicy('');
    expect(policy.identityGrounding).toEqual({ status: 'absent', code: IDENTITY_GROUNDING_UNWIRED });
  });
});
