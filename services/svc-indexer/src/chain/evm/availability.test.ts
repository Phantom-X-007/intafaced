import { describe, expect, it } from 'vitest';
import { ChainUnavailableError, classifyChainError, isBlockNotFound, isZeroAddress, ZERO_ADDRESS } from './availability.js';

/**
 * THE CLASSIFIER, WITHOUT A CHAIN.
 *
 * These fixtures are hand-built rather than produced by making real failing
 * calls: the point under test is the classification, and a test that needed a
 * live RPC to prove "we behave correctly without a live RPC" could never run in
 * the environment it describes.
 *
 * The shapes are taken from viem's own error classes — `name` on the wrapper and
 * a libuv `code` on the root `cause` — which is exactly why the classifier walks
 * the cause chain instead of using `instanceof`.
 *
 * Live suites still prove the same refusals against a real node. This file is
 * what keeps them from being the only place the promise is asserted — if anvil
 * is down, these still run.
 */

/** How viem surfaces a refused connection: BaseError wrapper, libuv cause. */
function connectionRefused(): Error {
  const root = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8545'), { code: 'ECONNREFUSED' });
  const transport = Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError', cause: root });
  return Object.assign(new Error('Details: connect ECONNREFUSED'), { name: 'HttpRequestError', cause: transport });
}

describe('classifying a failed chain read', () => {
  it('calls a nested ECONNREFUSED unreachable, and names the endpoint + the read', () => {
    const err = classifyChainError(connectionRefused(), 'head', 'http://localhost:8545');
    expect(err).toBeInstanceOf(ChainUnavailableError);
    expect(err.code).toBe('indexer.chain_unreachable');
    expect(err.message).toContain('http://localhost:8545');
    expect(err.message).toContain('head');
  });

  it.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT'])(
    'treats %s on the cause chain as unreachable',
    (code) => {
      const root = Object.assign(new Error('socket'), { code });
      const wrapped = Object.assign(new Error('outer'), { cause: root });
      expect(classifyChainError(wrapped, 'blockAt(1)', 'http://rpc').code).toBe('indexer.chain_unreachable');
    },
  );

  it('recognises a viem timeout by name even with no libuv cause', () => {
    const err = Object.assign(new Error('The request took too long'), { name: 'TimeoutError' });
    expect(classifyChainError(err, 'head', 'http://rpc').code).toBe('indexer.chain_unreachable');
  });

  it('classifies an unrecognised error as unreachable rather than inventing success', () => {
    const err = classifyChainError(new Error('something odd'), 'probe', 'http://rpc');
    expect(err.code).toBe('indexer.chain_unreachable');
    expect(err.message).toContain('something odd');
  });

  it('passes an already-typed refusal through unchanged', () => {
    const original = new ChainUnavailableError('indexer.chain_not_configured', 'nope');
    expect(classifyChainError(original, 'x', 'http://rpc')).toBe(original);
  });

  it('survives a cyclic cause chain instead of hanging', () => {
    const a: { message: string; cause?: unknown } = { message: 'a' };
    const b = { message: 'b', cause: a };
    a.cause = b;
    expect(classifyChainError(a, 'head', 'http://rpc').code).toBe('indexer.chain_unreachable');
  });

  it('keeps the original error as the cause, so nothing is lost for the logs', () => {
    const root = connectionRefused();
    expect(classifyChainError(root, 'head', 'http://rpc').cause).toBe(root);
  });
});

describe('isBlockNotFound — the one negative answer that is information', () => {
  it('matches viem BlockNotFoundError by name, nested in a cause chain', () => {
    const leaf = Object.assign(new Error('Block at number 99 could not be found.'), {
      name: 'BlockNotFoundError',
    });
    const wrapped = Object.assign(new Error('request failed'), { cause: leaf });
    expect(isBlockNotFound(wrapped)).toBe(true);
  });

  it("matches the message shape when the name is not viem's own", () => {
    const err = new Error('Block at hash 0xabc could not be found.');
    expect(isBlockNotFound(err)).toBe(true);
  });

  it('does not match a transport refusal', () => {
    expect(isBlockNotFound(connectionRefused())).toBe(false);
  });
});

describe('the zero address is a configuration refusal, not a venue', () => {
  it('matches regardless of case', () => {
    expect(isZeroAddress(ZERO_ADDRESS)).toBe(true);
    expect(isZeroAddress('0x0000000000000000000000000000000000000000'.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('does not match a real address', () => {
    expect(isZeroAddress('0x1111111111111111111111111111111111111111')).toBe(false);
  });
});
