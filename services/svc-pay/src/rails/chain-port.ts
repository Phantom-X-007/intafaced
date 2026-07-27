import { formatAmount, type Amount } from '@intafaced/ledger-client';

/**
 * The chain, as `crypto-native` needs it.
 *
 * Doctrine §0.4 applies to our own infrastructure too: the adapter talks to
 * this interface, not to a node, an RPC provider or an indexer. In production
 * this is implemented against the chain watcher; in dev and in every test it is
 * `MemoryChain` below. The adapter cannot tell the difference, which is what
 * makes the adapter's own logic testable to the branch.
 *
 * Amounts are `Amount` — scaled bigint — on both sides. Chains speak in their
 * own smallest units; converting to and from those is the implementation's job,
 * at its own edge, and a `number` never appears in either direction.
 */

export interface ConfirmedTransfer {
  readonly txHash: string;
  /** The payer's address. This is where a refund has to go back to. */
  readonly from: string;
  readonly assetId: string;
  readonly amount: Amount;
  /** Blocks deep. The adapter's confirmation threshold is what makes it final. */
  readonly confirmations: number;
}

export interface ChainSendRequest {
  readonly to: string;
  readonly assetId: string;
  readonly amount: Amount;
  /**
   * Business key for the outbound transfer.
   *
   * The chain layer must return the ORIGINAL broadcast for a repeated key
   * rather than broadcasting again. Retrying an outbound payment because a
   * response timed out is the single most expensive mistake available on this
   * path: the first transfer already left, and it is not coming back.
   */
  readonly idempotencyKey: string;
}

export interface CryptoChainPort {
  /** Deterministic per (payment, asset) — the same payment always gets the same address. */
  acceptanceAddress(paymentId: string, assetId: string): Promise<string>;
  /**
   * The inbound transfer to an acceptance address, if one has landed.
   *
   * Takes only the address, and the transfer says what asset arrived. The
   * caller must NOT be able to ask "did the asset I expected arrive here" —
   * that phrasing cannot see a payer who sent the wrong token to the right
   * address, which is a thing payers do, and those funds would then sit at an
   * address nothing points at.
   */
  inboundTransfer(address: string): Promise<ConfirmedTransfer | null>;
  send(request: ChainSendRequest): Promise<{ txHash: string }>;
}

/**
 * In-memory chain — the reference implementation of the port.
 *
 * The same role `MemoryLedger` plays for the ledger: not a toy, but an
 * executable specification of what the adapter is entitled to assume. Confirm
 * depth, idempotent broadcast, and "a transfer that has not landed is null" are
 * all modelled here, so an adapter that behaves correctly against this one
 * behaves correctly against a chain.
 */
export class MemoryChain implements CryptoChainPort {
  private readonly transfers = new Map<string, ConfirmedTransfer>();
  private readonly sent = new Map<string, { txHash: string }>();
  private readonly outbound: Array<ChainSendRequest & { txHash: string }> = [];
  private nonce = 0;
  private broadcastError: Error | null = null;
  private callError: Error | null = null;

  async acceptanceAddress(paymentId: string, assetId: string): Promise<string> {
    this.takeCallError();
    return `addr_${assetId.toLowerCase()}_${paymentId}`;
  }

  async inboundTransfer(address: string): Promise<ConfirmedTransfer | null> {
    this.takeCallError();
    return this.transfers.get(address) ?? null;
  }

  async send(request: ChainSendRequest): Promise<{ txHash: string }> {
    // Idempotency is checked BEFORE the injected failure, because that is the
    // real ordering: a key that has already been broadcast returns the original
    // no matter what the node is doing now.
    const existing = this.sent.get(request.idempotencyKey);
    if (existing) return existing;

    this.takeCallError();

    if (this.broadcastError) {
      const err = this.broadcastError;
      this.broadcastError = null;
      throw err;
    }

    const txHash = `0xout${(++this.nonce).toString(16).padStart(8, '0')}`;
    this.sent.set(request.idempotencyKey, { txHash });
    this.outbound.push({ ...request, txHash });
    return { txHash };
  }

  // ── Test / dev controls ────────────────────────────────────────────────────

  /** Simulate a payer sending funds to an acceptance address. */
  credit(input: { address: string; assetId: string; amount: Amount; from?: string; confirmations?: number; txHash?: string }): void {
    this.transfers.set(input.address, {
      txHash: input.txHash ?? `0xin${(++this.nonce).toString(16).padStart(8, '0')}`,
      from: input.from ?? '0xpayer',
      assetId: input.assetId,
      amount: input.amount,
      confirmations: input.confirmations ?? 12,
    });
  }

  /** Deepen (or shallow) an existing transfer — drives the confirmation branch. */
  setConfirmations(address: string, confirmations: number): void {
    const existing = this.transfers.get(address);
    if (existing) this.transfers.set(address, { ...existing, confirmations });
  }

  /** The next broadcast throws, once. Rail failure on the way OUT. */
  failNextBroadcast(error = new Error('chain rpc unavailable')): void {
    this.broadcastError = error;
  }

  /**
   * The next call of ANY kind throws, once — an RPC outage rather than a
   * rejected transaction. The adapter must turn this into a failed result, not
   * let it escape: a chain provider having a bad minute is not an exception in
   * a payments core, it is Tuesday.
   */
  failNextCall(error = new Error('chain rpc unavailable')): void {
    this.callError = error;
  }

  /** Everything this chain has been asked to send — the outbound audit. */
  outboundTransfers(): ReadonlyArray<ChainSendRequest & { txHash: string }> {
    return this.outbound;
  }

  totalSent(assetId: string): string {
    return formatAmount(this.outbound.filter((o) => o.assetId === assetId).reduce((acc, o) => acc + o.amount, 0n));
  }

  reset(): void {
    this.transfers.clear();
    this.sent.clear();
    this.outbound.length = 0;
    this.broadcastError = null;
    this.callError = null;
    this.nonce = 0;
  }

  private takeCallError(): void {
    if (!this.callError) return;
    const err = this.callError;
    this.callError = null;
    throw err;
  }
}
