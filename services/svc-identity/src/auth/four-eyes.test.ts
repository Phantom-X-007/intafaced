import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_MISSING,
  DUAL_CONTROL_MISSING,
  approvalThresholdsUnset,
  attributionOnFill,
  attributionOnLedger,
  attributionOnOrder,
  fourEyes,
  installFourEyes,
  stampAttribution,
} from './four-eyes.js';

installFourEyes();

describe('four-eyes / attribution — dual-control refuse, stamp survives', () => {
  it('policy change without a second actor refuses', () => {
    const refused = fourEyes('policy', { actorId: 'alice' });
    expect(refused.accepted).toBe(false);
    if (!refused.accepted) expect(refused.rejected.code).toBe(DUAL_CONTROL_MISSING);
  });

  it('key change with the same actor twice refuses', () => {
    const refused = fourEyes('key', { actorId: 'alice', confirmActorId: 'alice' });
    expect(refused.accepted).toBe(false);
    if (!refused.accepted) expect(refused.rejected.code).toBe(DUAL_CONTROL_MISSING);
  });

  it('high-risk transfer with two distinct actors applies', () => {
    const ok = fourEyes('high_risk_transfer', { actorId: 'alice', confirmActorId: 'bob' });
    expect(ok.accepted).toBe(true);
    if (ok.accepted) {
      expect(ok.actorId).toBe('alice');
      expect(ok.confirmActorId).toBe('bob');
    }
  });

  it('does not invent approval thresholds', () => {
    expect(approvalThresholdsUnset()).toBe(true);
    expect(process.env.IDENTITY_APPROVAL_THRESHOLD).toBeUndefined();
  });

  it('missing session and API-key id is a named refuse — no invented attribution', () => {
    const refused = stampAttribution({});
    expect(refused.accepted).toBe(false);
    if (!refused.accepted) {
      expect(refused.stamp).toBeNull();
      expect(refused.rejected.code).toBe(ATTRIBUTION_MISSING);
    }
  });

  it('session id survives onto order/fill/ledger', () => {
    const stamped = stampAttribution({ sessionId: 'sess-1' });
    expect(stamped.accepted).toBe(true);
    if (!stamped.accepted) return;
    expect(attributionOnOrder(stamped.stamp).sessionId).toBe('sess-1');
    expect(attributionOnFill(stamped.stamp).sessionId).toBe('sess-1');
    expect(attributionOnLedger(stamped.stamp).sessionId).toBe('sess-1');
    expect(attributionOnOrder(stamped.stamp).apiKeyId).toBeNull();
  });

  it('API-key id survives onto order/fill/ledger', () => {
    const stamped = stampAttribution({ apiKeyId: 'key-9' });
    expect(stamped.accepted).toBe(true);
    if (!stamped.accepted) return;
    expect(attributionOnOrder(stamped.stamp).apiKeyId).toBe('key-9');
    expect(attributionOnFill(stamped.stamp).apiKeyId).toBe('key-9');
    expect(attributionOnLedger(stamped.stamp).apiKeyId).toBe('key-9');
  });
});
