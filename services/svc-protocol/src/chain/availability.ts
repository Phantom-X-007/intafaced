/**
 * WHEN THERE IS NO CHAIN, SAY SO — with a code, not a stack trace.
 *
 * There is no EVM RPC in this environment (SOCKET §13 `socket.evm-rpc`).
 * Blank `PROTOCOL_RPC_URL` refuses boot; an operator-set URL with nothing
 * listening is classified here, not invented as live.
 * Every read in `client.ts` therefore fails today. The question this file
 * answers is not *whether* it fails — it is *how*.
 *
 * Before this file, a chain read failed as a raw viem `HttpRequestError` and
 * `router.ts` mapped anything it did not recognise to
 * `INTERNAL_SERVER_ERROR: 'Protocol request failed'`. A caller could not tell
 * "the chain is not there" from "svc-protocol has a bug", and a 500 invites a
 * retry that can never succeed.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS FILE EXISTS TO PREVENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `ContractFunctionZeroDataError`. viem raises it when a `view` call is made to
 * an address holding no code: the EVM returns `0x`, and there is nothing to
 * decode. It is not a transport failure and it is not a revert — it means **the
 * contract you asked about does not exist**.
 *
 * That error must never be flattened into an empty answer. `sessionStatus`
 * returns `{ exists: false, live: false, spentWei: null, revoked: null }` when
 * the chain reports no session, and that shape is indistinguishable from "we
 * asked an address with no code on it". One means "the owner granted nothing";
 * the other means "we do not know". A UI that renders the second as the first
 * tells a user their agent holds no permissions when the truth is that nobody
 * has looked. `protocol.contract_not_deployed` is that distinction, made
 * typed.
 *
 * Classification is by error name and by the `cause` chain rather than by
 * `instanceof` against viem's exported classes: viem re-wraps errors as it
 * bubbles them through the transport, so the concrete class at the top is a
 * version detail, while the names and the libuv `code` on the root cause are
 * stable and directly testable.
 */

/** Why a chain-dependent path could not answer. Never "something went wrong". */
export type ChainRefusalCode =
  /** Addresses are still the zero-address defaults — nothing is deployed. */
  | 'protocol.chain_not_configured'
  /** The RPC endpoint did not answer: refused, timed out, or unresolvable. */
  | 'protocol.chain_unreachable'
  /** The RPC answered, but the address holds no code. */
  | 'protocol.contract_not_deployed'
  /** The RPC answered for a different chain than the one we derive addresses for. */
  | 'protocol.chain_id_mismatch';

export class ChainUnavailableError extends Error {
  readonly code: ChainRefusalCode;

  constructor(code: ChainRefusalCode, message: string, cause?: unknown) {
    // `cause` goes through the standard Error option rather than a redeclared
    // field: `useDefineForClassFields` is on at ES2022, so a parameter property
    // named `cause` would define over the one Error already installs.
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ChainUnavailableError';
    this.code = code;
  }
}

/** libuv / undici codes that all mean "the endpoint is not there". */
const TRANSPORT_CAUSE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** viem error names that mean the transport never got an answer. */
const TRANSPORT_ERROR_NAMES = new Set([
  'HttpRequestError',
  'TimeoutError',
  'SocketClosedError',
  'RpcRequestError',
  'InternalRpcError',
  'ResourceUnavailableRpcError',
  'ConnectionFailedError',
]);

/** viem error names that mean "there is no code at that address". */
const ABSENT_CONTRACT_ERROR_NAMES = new Set(['ContractFunctionZeroDataError']);

/** Walk `cause` to the bottom. viem nests three or four deep. */
function causeChain(err: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = err;
  // Bounded: a cycle in a cause chain would otherwise hang the request.
  for (let depth = 0; current !== undefined && current !== null && depth < 12; depth += 1) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

function nameOf(value: unknown): string {
  return typeof (value as { name?: unknown })?.name === 'string' ? (value as { name: string }).name : '';
}

function codeOf(value: unknown): string {
  return typeof (value as { code?: unknown })?.code === 'string' ? (value as { code: string }).code : '';
}

function messageOf(value: unknown): string {
  return typeof (value as { message?: unknown })?.message === 'string' ? (value as { message: string }).message : '';
}

/**
 * Turn whatever viem threw into a typed refusal.
 *
 * `what` names the read in the message so a 503 body says which question went
 * unanswered — "sessionStatus" is actionable, "request failed" is not.
 */
export function classifyChainError(err: unknown, what: string, rpcUrl: string): ChainUnavailableError {
  if (err instanceof ChainUnavailableError) return err;

  const chain = causeChain(err);

  // Absence first. It is the most specific signal and the one that must never
  // be mistaken for an empty result.
  for (const link of chain) {
    if (ABSENT_CONTRACT_ERROR_NAMES.has(nameOf(link)) || /returned no data \("0x"\)/.test(messageOf(link))) {
      return new ChainUnavailableError(
        'protocol.contract_not_deployed',
        `${what}: the address holds no contract code on this chain, so there is nothing to read. ` +
          `This is not an empty result — the contract is absent.`,
        err,
      );
    }
  }

  for (const link of chain) {
    if (TRANSPORT_CAUSE_CODES.has(codeOf(link)) || TRANSPORT_ERROR_NAMES.has(nameOf(link))) {
      return new ChainUnavailableError(
        'protocol.chain_unreachable',
        `${what}: no answer from the EVM RPC at ${rpcUrl}. No chain state was read, so no result is being reported. ` +
          `(SOCKET §13 socket.evm-rpc)`,
        err,
      );
    }
  }

  return new ChainUnavailableError(
    'protocol.chain_unreachable',
    `${what}: the EVM RPC at ${rpcUrl} did not return a usable answer (${messageOf(err) || 'unknown error'}). ` +
      `Refusing rather than reporting a result that was never read.`,
    err,
  );
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * The zero-address defaults in `env.ts` are deliberate: an unset factory is a
 * loud zero rather than a plausible-looking address. Deriving a CREATE2 address
 * from `factory = 0x0` yields a real, checksummed, entirely fictional address —
 * the single worst output this service could give a user, because they can fund
 * it. `router.ts` refuses on this check before any arithmetic runs.
 */
export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS;
}
