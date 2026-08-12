import { BankError } from '../errors.js';
import { FIAT_OFFRAMP_PAY_ADAPTER_ID, FIAT_PAY_ADAPTER_WIRE, FIAT_RAMP_SOCKET, type FiatPayAdapterWire } from './pay-adapter-wire.js';

/**
 * THE RAMP RAIL PORT (§8.1 `bank.ramps` / D-S-09) — and the line this file draws.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CRYPTO LEDGER HALF vs FIAT §13 SOCKET
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * ADR `docs/adr/2026-08-04-bank-vertical-law.md` splits `bank.ramps`:
 *
 *   CRYPTO LEG — buildable today. `crypto-native` already exists as a real rail
 *   in svc-pay; this service adds the bank-facing ledger surface (deposit /
 *   withdraw recipes into the book). No third-party signature is required for
 *   that arithmetic.
 *
 *   FIAT LEG — `socket.psp-partners`. A bank/PSP partner and money-transmission
 *   permission are a commercial relationship. No amount of engineering time
 *   produces either. Refusing by name is the only honest thing this module can
 *   do for fiat. When the socket closes, fiat on/off reuses **svc-pay**
 *   RailAdapter ids (`fiatPayAdapters`) — bank does not grow a second book.
 *
 * The setting below selects the CRYPTO ledger half only. There is no value that
 * turns on a fiat rail, and there is no value that claims a live chain send —
 * `simulated` is always true on this surface. Pointing working code at real
 * money is Class X (Nitro human). Live inbound chain confirmation stays in
 * svc-pay so this service does not become a second book against the same
 * chain mirror.
 *
 * Rail label on ledger posts is `bank-crypto-ledger`, deliberately DISTINCT
 * from svc-pay's `crypto-native` boundary: an operator credit here must not
 * desync pay's chain reconciliation (see svc-pay user-money doctrine).
 */

/** What the ramp programme calls itself, and whether it is real. */
export interface RampProgramme {
  /** Stable identifier — also selects the ledger rail when crypto-ledger. */
  readonly id: string;
  /**
   * TRUE MEANS NO LIVE RAMP EXISTS.
   *
   * Always true today. A live rail cannot be selected here: crypto live send /
   * confirm is svc-pay + Class X; fiat is `socket.psp-partners`.
   */
  readonly simulated: boolean;
  /** Human label. Never a PSP or partner brand (§0.7). */
  readonly displayName: string;
  /** Ledger rail string used on deposit/withdraw recipes, or null when none. */
  readonly cryptoRail: string | null;
  /** Always names the fiat socket — never "coming soon". */
  readonly fiatLeg: typeof FIAT_RAMP_SOCKET;
  /**
   * Which svc-pay adapter ids fiat would reuse when the socket closes.
   * Never a bank-local fiat rail. See `pay-adapter-wire.ts`.
   */
  readonly fiatPayAdapters: FiatPayAdapterWire;
}

export const RAMP_SETTINGS = ['none', 'crypto-ledger'] as const;
export type RampSetting = (typeof RAMP_SETTINGS)[number];

/** Ledger rail for the crypto half. Not svc-pay's `crypto-native` boundary. */
export const BANK_CRYPTO_LEDGER_RAIL = 'bank-crypto-ledger';

export const NO_RAMP_PROGRAMME: RampProgramme = {
  id: 'none',
  simulated: true,
  displayName: 'No bank ramp programme',
  cryptoRail: null,
  fiatLeg: FIAT_RAMP_SOCKET,
  fiatPayAdapters: FIAT_PAY_ADAPTER_WIRE,
};

export const CRYPTO_LEDGER_PROGRAMME: RampProgramme = {
  id: 'crypto-ledger',
  simulated: true,
  displayName: 'Crypto ledger half (no chain broadcast; fiat is a socket)',
  cryptoRail: BANK_CRYPTO_LEDGER_RAIL,
  fiatLeg: FIAT_RAMP_SOCKET,
  fiatPayAdapters: FIAT_PAY_ADAPTER_WIRE,
};

/**
 * Total mapping. Silence → none. No fallback to crypto-ledger by accident —
 * same posture as `cardIssuerFor` / `BANK_CARD_ISSUER`.
 */
export function rampProgrammeFor(setting: RampSetting): RampProgramme {
  switch (setting) {
    case 'none':
      return NO_RAMP_PROGRAMME;
    case 'crypto-ledger':
      return CRYPTO_LEDGER_PROGRAMME;
    default: {
      const _exhaustive: never = setting;
      throw new Error(`unreachable ramp setting: ${String(_exhaustive)}`);
    }
  }
}

/** Refuse when this deployment has not chosen a crypto ledger half. */
export function assertCryptoRamp(programme: RampProgramme): string {
  if (!programme.cryptoRail) {
    throw new BankError(
      'No bank ramp programme is configured — set BANK_RAMP_MODE=crypto-ledger for the crypto ledger half, or leave none and do not call ramps',
      'bank.no_ramp_rail',
    );
  }
  return programme.cryptoRail;
}

/**
 * Fiat is §13 forever on this surface. The caller's kind is wrong, not their
 * amount — refuse by the socket name so nobody invents a PSP path in-process.
 *
 * The message names the pay-adapter wire so operators know fiat would reuse
 * svc-pay (`bank-payout` offramp; no inbound adapter yet) — not a bank-local
 * second book, APY, or card BIN.
 */
export function refuseFiatRamp(direction: 'onramp' | 'offramp' = 'onramp'): never {
  const wire = FIAT_PAY_ADAPTER_WIRE;
  const adapterClause =
    direction === 'offramp'
      ? `Offramp reuses svc-pay adapter "${wire.offramp}" (absent until sponsor bank).`
      : 'Onramp has no registered svc-pay fiat-inbound adapter yet — socket until pay grows one.';
  throw new BankError(
    `Fiat on/off ramp is ${FIAT_RAMP_SOCKET} — a bank/PSP partner and money-transmission permission, not code. ` +
      `${adapterClause} Bank does not hold a second fiat book.`,
    'bank.fiat_ramp_socket',
  );
}

export { FIAT_OFFRAMP_PAY_ADAPTER_ID, FIAT_PAY_ADAPTER_WIRE, FIAT_RAMP_SOCKET, type FiatPayAdapterWire };
