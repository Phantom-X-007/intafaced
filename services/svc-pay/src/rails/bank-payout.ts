import type { Amount } from '@intafaced/ledger-client';
import type {
  PaymentIntent,
  RailAdapter,
  RailCapability,
  RailEvent,
  RailHealth,
  RailResult,
  RailWebhookRequest,
  SettlementInstruction,
} from './rail-adapter.js';

/**
 * `bank-payout` — the bank settlement rail that does not exist yet.
 *
 * SPEC §6 dual settlement names bank OR crypto. Crypto is real when configured.
 * Bank payout needs a sponsor bank / licence (Class X commercial socket) — there
 * is no honest simulation that debits merchant available and invents a bank
 * reference. `card-sandbox` is a card acquirer mock, not a bank payout rail.
 *
 * This adapter is registered with `mode: 'absent'` so:
 *   - Merchants can name `bank-payout` and get `pay.rail_not_live` / absent
 *     BEFORE any ledger hold (assertRailMayMoveValue).
 *   - `/ready` and railHealth list it as absent, not as a working sandbox.
 *   - Boot posture is unaffected: absent is not sandbox, so staging/prod boot.
 *
 * A live bank rail is a DIFFERENT adapter that passes the conformance kit.
 * Flipping a flag on this class is forbidden — there is nothing to flip.
 */
export class BankPayoutAbsentAdapter implements RailAdapter {
  readonly id = 'bank-payout';
  /** Payout only — this is a settlement-out rail, not an acquiring rail. */
  readonly capabilities: readonly RailCapability[] = ['payout'];
  readonly mode = 'absent' as const;

  private readonly now: () => Date;
  private lastContact: Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
    this.lastContact = this.now();
  }

  health(): RailHealth {
    return {
      healthy: false,
      lastUpdate: this.lastContact,
      reason: 'bank-payout has nothing configured — sponsor bank / licence required (socket.psp-partners). Every call refuses.',
    };
  }

  async authorize(_p: PaymentIntent): Promise<RailResult> {
    return this.refuse('authorize', _p.amount, _p.assetId);
  }

  async capture(_ref: string): Promise<RailResult> {
    return this.refuse('capture', 0n, 'UNKNOWN');
  }

  async refund(_ref: string, amount: Amount): Promise<RailResult> {
    return this.refuse('refund', amount, 'UNKNOWN');
  }

  async payout(s: SettlementInstruction): Promise<RailResult> {
    return this.refuse('payout', s.amount, s.assetId);
  }

  verifyWebhook(_req: RailWebhookRequest): RailEvent | null {
    return null;
  }

  private refuse(op: string, amount: Amount, assetId: string): RailResult {
    this.lastContact = this.now();
    return {
      ok: false,
      railRef: '',
      status: 'failed',
      amount,
      assetId,
      at: this.lastContact,
      failureCode: 'bank.not_configured',
      failureReason:
        `Rail bank-payout has NOTHING CONFIGURED for ${op}. ` +
        'A sponsor bank relationship is a commercial socket, not a code gap. No value moved.',
    };
  }
}
