/**
 * WHEN THE CHAIN CANNOT BE READ, SAY SO — with a code, not an empty answer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS FILE EXISTS TO PREVENT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `ChainSource.head()` returns `null` to mean "this source has no chain to
 * report", and the ingest loop treats that as *nothing to do* — no error, no
 * alert, no halt. That contract is exactly right for `NullChainSource`, which
 * genuinely has no chain.
 *
 * For an RPC adapter it is a trap. If `head()` swallowed a connection refusal
 * and returned `null`, an indexer pointed at a dead endpoint would look
 * IDENTICAL to one honestly reporting that it was never given a chain: the loop
 * would idle, `status` would report a cursor that stopped moving hours ago
 * without saying why, and `book` would keep serving the last projection it had
 * as though it were current. Nobody would be told anything. That is the whole
 * class of bug this service was written to avoid, arriving through the one method
 * whose `null` is legitimate.
 *
 * So the EVM adapter NEVER returns `null` for a failure. It throws one of the
 * codes below, `Indexer` records it on `lastError`, and `status` surfaces it
 * next to the cursor it explains. `null` from this adapter means one thing only:
 * the chain answered, and there is no block at that height yet.
 *
 * ── Why this is not svc-protocol's `chain/availability.ts` ──────────────────
 *
 * Because that file classifies `ContractFunctionZeroDataError` — the "you called
 * a view function on an address with no code" case — and this service never
 * calls a contract function. It reads blocks, logs and code, so the only
 * distinctions worth making here are transport failure, wrong chain, absent
 * venue, and a block the node described in a shape we will not project. Copying
 * the parts that do not apply would be code nobody can test from this service.
 * The overlap that IS real (the libuv/undici cause codes, the viem error names)
 * is small, stable, and duplicated deliberately rather than reached for across a
 * service boundary — see `scripts/contract-sources.mjs` for the same call.
 */

/** Why the chain could not be read. Never "something went wrong". */
export type ChainRefusalCode =
  /** No RPC URL, or the venue address is still the zero-address default. */
  | 'indexer.chain_not_configured'
  /** The RPC endpoint did not answer: refused, timed out, or unresolvable. */
  | 'indexer.chain_unreachable'
  /** The RPC answered for a different chain than the one we are projecting. */
  | 'indexer.chain_id_mismatch'
  /** The RPC answered, and the venue address holds no contract code. */
  | 'indexer.venue_not_deployed'
  /** The node returned a block we will not project — see `decode.ts`. */
  | 'indexer.malformed_block';

export class ChainUnavailableError extends Error {
  readonly code: ChainRefusalCode;

  constructor(code: ChainRefusalCode, message: string, cause?: unknown) {
    // `cause` goes through the standard Error option rather than a parameter
    // property: `useDefineForClassFields` is on at ES2022, so a field named
    // `cause` would define over the one Error already installs.
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

/**
 * viem error names that mean "the chain has no such block".
 *
 * This one is NOT a refusal. Asking for the block above the tip is how the
 * ingest loop discovers it has caught up, so it must come back as `null` and
 * not as an error — see `isBlockNotFound`.
 */
const BLOCK_ABSENT_ERROR_NAMES = new Set(['BlockNotFoundError']);

/** Walk `cause` to the bottom. viem nests three or four deep. */
function causeChain(err: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = err;
  // Bounded: a cycle in a cause chain would otherwise hang the ingest loop.
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
 * "There is no block at that height (yet)" — the one negative answer that is
 * information rather than a failure.
 *
 * Matched on the error name and on the message, because a node that does not
 * raise viem's own `BlockNotFoundError` still tends to answer JSON-RPC `null`,
 * which viem turns into a message saying exactly this.
 */
export function isBlockNotFound(err: unknown): boolean {
  for (const link of causeChain(err)) {
    if (BLOCK_ABSENT_ERROR_NAMES.has(nameOf(link))) return true;
    if (/block at (number|hash) .* could not be found/i.test(messageOf(link))) return true;
  }
  return false;
}

/**
 * Turn whatever viem threw into a typed refusal.
 *
 * `what` names the read in the message so the reason attached to a stalled
 * cursor says which question went unanswered — "blockAt(1841)" is actionable,
 * "request failed" is not.
 */
export function classifyChainError(err: unknown, what: string, rpcUrl: string): ChainUnavailableError {
  if (err instanceof ChainUnavailableError) return err;

  const chain = causeChain(err);

  for (const link of chain) {
    if (TRANSPORT_CAUSE_CODES.has(codeOf(link)) || TRANSPORT_ERROR_NAMES.has(nameOf(link))) {
      return new ChainUnavailableError(
        'indexer.chain_unreachable',
        `${what}: no answer from the EVM RPC at ${rpcUrl}. Nothing was read, so nothing is being projected — ` +
          `the cursor stays where it is and this is why.`,
        err,
      );
    }
  }

  return new ChainUnavailableError(
    'indexer.chain_unreachable',
    `${what}: the EVM RPC at ${rpcUrl} did not return a usable answer (${messageOf(err) || 'unknown error'}). ` +
      `Refusing rather than advancing the projection past a block nobody read.`,
    err,
  );
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * An unset venue address is a loud zero rather than a plausible-looking one.
 *
 * `eth_getLogs` against `0x0` succeeds and returns `[]`, every time, forever.
 * That is the single most dangerous answer this service can receive: it looks
 * exactly like a market with no activity, so the projection stays empty and
 * every read reports an empty book with total confidence. The zero address is
 * therefore a configuration refusal, checked before any RPC call is made.
 */
export function isZeroAddress(address: string): boolean {
  return address.toLowerCase() === ZERO_ADDRESS;
}
