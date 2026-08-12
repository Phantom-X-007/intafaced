/**
 * FIAT RAMP → svc-pay ADAPTER WIRE (D26-P1-B4 / bank.ramps).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO SECOND BOOK
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Fiat on/off does not invent a bank-local rail, balance, APY, or card BIN.
 * When a PSP relationship lands (Class X / `socket.psp-partners`), value moves
 * through **svc-pay RailAdapter** ids already registered there — bank only owns
 * the ledger surface for the crypto half (`bank-crypto-ledger`).
 *
 * This file is the named wire: which pay adapter id each fiat direction would
 * call. Bank never imports svc-pay (§2). The strings MUST match pay's registered
 * adapter ids; tests pin the offramp id against that contract by name.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT EXISTS TODAY
 * ═════════════════════════════════════════════════════════════════════════════
 *
 *   offramp → `bank-payout`  — registered in svc-pay as `mode: 'absent'`.
 *                              Every call refuses until a sponsor bank lands.
 *   onramp  → null           — no pay adapter is registered for fiat inbound
 *                              (ACH/wire deposit). Naming a fake id would be a
 *                              second invent. Socket until pay grows one.
 *
 * Flipping a flag here cannot make fiat live. Live is Class X on the pay side.
 */

/** svc-pay rail id for fiat settlement-out. Must match `BankPayoutAbsentAdapter.id`. */
export const FIAT_OFFRAMP_PAY_ADAPTER_ID = 'bank-payout' as const;

/**
 * Honest map of fiat directions → pay adapter ids.
 *
 * `onramp: null` is deliberate: there is no registered pay adapter for fiat
 * inbound. Do not invent `bank-deposit` here — that belongs in svc-pay when a
 * real (or absent-mode) adapter ships.
 */
export interface FiatPayAdapterWire {
  /** Pay adapter that would authorize/capture fiat inbound — null until pay registers one. */
  readonly onramp: null;
  /** Pay adapter that would payout fiat outbound — `bank-payout` (absent today). */
  readonly offramp: typeof FIAT_OFFRAMP_PAY_ADAPTER_ID;
}

export const FIAT_PAY_ADAPTER_WIRE: FiatPayAdapterWire = {
  onramp: null,
  offramp: FIAT_OFFRAMP_PAY_ADAPTER_ID,
};

/** Stable socket name — never "coming soon", never a partner brand. */
export const FIAT_RAMP_SOCKET = 'socket.psp-partners' as const;
