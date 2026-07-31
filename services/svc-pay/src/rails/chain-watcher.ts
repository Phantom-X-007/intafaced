import { formatAmount } from '@intafaced/ledger-client';
import type { EvmLiveChain } from './evm-chain.js';
import { signPayload } from './webhook-signature.js';

/**
 * Chain watcher — the fourth owner-obtainable from the README, as code.
 *
 * Polls the live chain port, and when an inbound transfer to a watched
 * acceptance address reaches `minConfirmations`, POSTs a signed webhook to
 * svc-pay's own `/webhooks/crypto-native` endpoint. The adapter's
 * `verifyWebhook` is what authenticates it; the payment core's
 * `handleWebhook` is what books it. Nothing here moves ledger money.
 */

export interface ChainWatcherOptions {
  readonly chain: EvmLiveChain;
  readonly secret: string;
  /** Where to POST — typically `http://127.0.0.1:${HTTP_PORT}/webhooks/crypto-native`. */
  readonly webhookUrl: string;
  readonly pollIntervalMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export class CryptoChainWatcher {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly log: (msg: string, extra?: Record<string, unknown>) => void;

  constructor(private readonly options: ChainWatcherOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.log = options.log ?? (() => undefined);
  }

  start(): void {
    if (this.timer) return;
    const interval = this.options.pollIntervalMs ?? 2_000;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), interval);
    // Do not keep the process alive solely for the watcher in tests.
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      await this.options.chain.refresh();
      const finalized = this.options.chain.drainFinalized();
      for (const item of finalized) {
        await this.deliver(item.address, item.transfer);
      }
      return finalized.length;
    } catch (err) {
      this.log('chain watcher tick failed', {
        err: err instanceof Error ? err.message : String(err),
      });
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async deliver(
    address: string,
    transfer: { txHash: string; assetId: string; amount: bigint; from: string; confirmations: number },
  ): Promise<void> {
    const at = this.now();
    const payload = {
      id: `chain:${transfer.txHash}:${address}`,
      type: 'captured',
      ref: address,
      amount: formatAmount(transfer.amount),
      assetId: transfer.assetId,
      occurredAt: at.toISOString(),
      txHash: transfer.txHash,
      from: transfer.from,
      confirmations: transfer.confirmations,
    };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(at.getTime() / 1000).toString();
    const signature = signPayload(this.options.secret, timestamp, body);

    const res = await this.fetchImpl(this.options.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chain-signature': signature,
        'x-chain-timestamp': timestamp,
      },
      body,
    });

    if (!res.ok && res.status !== 202) {
      // Do not mark emitted — next tick re-drains and retries (M226-03).
      this.log('chain watcher delivery rejected', { status: res.status, address, txHash: transfer.txHash });
    } else {
      this.options.chain.markFinalizedEmitted(address);
      this.log('chain watcher delivered', { address, txHash: transfer.txHash, status: res.status });
    }
  }
}
