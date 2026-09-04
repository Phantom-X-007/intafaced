import { describe, expect, it } from 'vitest';
import { INSURED_REFUSED, copyWithoutInsuredClaim, refuseInsuredClaim } from './insured-refuse.js';

describe('insured refuse — identity never claims insured', () => {
  it('refuses an affirmative insured claim', () => {
    const refused = refuseInsuredClaim('Deposits are insured by the house.');
    expect(refused.accepted).toBe(false);
    if (!refused.accepted) expect(refused.rejected.code).toBe(INSURED_REFUSED);
    expect(copyWithoutInsuredClaim('Your account is insured.')).toBe(INSURED_REFUSED);
  });

  it('lets honest negation and unrelated copy through', () => {
    expect(refuseInsuredClaim('Accounts are not insured.').accepted).toBe(true);
    expect(refuseInsuredClaim('uninsured until an owner seal exists').accepted).toBe(true);
    expect(refuseInsuredClaim('We could not find that.').accepted).toBe(true);
    expect(copyWithoutInsuredClaim('Your session has expired. Sign in again.')).toBe('Your session has expired. Sign in again.');
  });
});
