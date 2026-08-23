import { describe, expect, it } from 'vitest';
import { acceptShare, parseRequest } from './stratum.js';

describe('Stratum share protocol', () => {
  it('accepts a valid share and rejects malformed requests by named reason', () => {
    expect(parseRequest('{"id":1,"method":"mining.submit","params":["worker","job","abcd"]}')).toMatchObject({ id: 1 });
    expect(acceptShare({ minerId: 'm', worker: 'w', jobId: 'j', nonce: 'abcd', shareHash: '00ff', target: '00ff' })).toMatchObject({
      accepted: true,
    });
    expect(acceptShare({ minerId: 'm', worker: 'w', jobId: '', nonce: 'abcd', shareHash: '00ff', target: '00ff' })).toEqual({
      accepted: false,
      reason: 'job_not_found',
    });
  });
});
