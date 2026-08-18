/**
 * D26-P1-C4 — paper flag / paper figures never readable as real money.
 *
 * Stage-2/3 already seal every paper wire payload (`simulated`, `venue`,
 * `realLedger`, `withdrawable`). That still leaves a hole: a future handler
 * can spread a sealed object and then attach a custody-looking key
 * (`availableBalance`, `ledgerTxId`, `holdAmount`, …). A client that keys off
 * field names — not the seal — then treats a drill as a funded position.
 *
 * This module is the second door. `assertPaperNeverReadableAsRealMoney` walks
 * the outbound payload and refuses any key that claims real custody, any
 * seal flip (`realMoney: true`, `withdrawable: true`, …), and any nested
 * object that tries the same. It is called on every paper success return
 * immediately after `assertSealedSimulated`, and on `paperOpsStatus`.
 *
 * It does NOT invent IFC, prizes, or balances. It only refuses shapes that
 * would let a paper flag be read as real money.
 */

import { AcademyError } from '../errors.js';

const PAPER_VENUE = 'paper' as const;

/**
 * Keys that mean "this is funded / custodial / withdrawable money" on this
 * platform. Presence of any of them on a paper payload is the incident.
 *
 * Deliberately excludes `realisedPnl` / `unrealisedPnl` / `totalPnl` — those
 * are simulated figures that MUST travel under the seal (and `realMoney:false`).
 * Banning them would delete the drill result itself.
 */
export const PAPER_REAL_MONEY_BANNED_KEYS = [
  'availableBalance',
  'available',
  'balance',
  'balances',
  'ledgerBalance',
  'ledgerTxId',
  'ledgerEntryId',
  'idempotencyKey',
  'holdAmount',
  'holdAsset',
  'settlementId',
  'custodyBalance',
  'withdrawableBalance',
  'withdrawableAmount',
  'realMoneyBalance',
  'fundedAmount',
  'reservedAmount',
  'walletBalance',
  'cashBalance',
  'buyingPower',
] as const;

const BANNED = new Set<string>(PAPER_REAL_MONEY_BANNED_KEYS);

/** Booleans that must stay false on any paper door (inbound or outbound). */
export const PAPER_SEAL_FALSE_KEYS = ['realMoney', 'realLedger', 'withdrawable', 'live', 'isLive'] as const;

function refuse(why: string): never {
  throw new AcademyError(
    `Paper payload refused — ${why}. A paper flag must never be readable as real money.`,
    'academy.paper_looks_like_real_money',
  );
}

/**
 * Deep-scan a paper success payload. Throws
 * `academy.paper_looks_like_real_money` when anything claims real custody.
 */
export function assertPaperNeverReadableAsRealMoney(payload: unknown, path = 'payload'): void {
  if (payload === null || payload === undefined) return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) => assertPaperNeverReadableAsRealMoney(item, `${path}[${i}]`));
    return;
  }
  if (typeof payload !== 'object') return;

  const o = payload as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    const here = `${path}.${key}`;
    if (BANNED.has(key)) {
      refuse(`${here} claims real custody ("${key}")`);
    }
    if ((PAPER_SEAL_FALSE_KEYS as readonly string[]).includes(key) && o[key] === true) {
      refuse(`${here} is true — paper must keep ${key}=false`);
    }
    if (key === 'venue' && o[key] !== PAPER_VENUE) {
      refuse(`${here} is ${JSON.stringify(o[key])} — paper doors are venue=${PAPER_VENUE}`);
    }
    // Nested objects / arrays (valuation, result, steps, …).
    assertPaperNeverReadableAsRealMoney(o[key], here);
  }
}

/**
 * Inbound door. A paper procedure must not accept a body that already claims
 * live / real money. Default Zod strip would let `realMoney: true` vanish and
 * the drill proceed as paper — callers use `.strict()` plus this scan.
 */
export function assertPaperInputNeverClaimsLive(payload: unknown, path = 'input'): void {
  assertPaperNeverReadableAsRealMoney(payload, path);
}

/** True when a key name is banned on paper payloads. */
export function isPaperRealMoneyBannedKey(key: string): boolean {
  return BANNED.has(key);
}
