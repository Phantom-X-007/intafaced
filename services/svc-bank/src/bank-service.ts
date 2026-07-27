import type { Sql } from 'postgres';
import type { LedgerClient } from '@intafaced/ledger-client';
import { SpaceService } from './spaces/space-service.js';
import { TransferService } from './transfers/transfer-service.js';
import { EarnService } from './earn/earn-service.js';
import { SpendAnalytics } from './analytics/spend.js';
import type { LedgerHistory } from './analytics/ledger-history.js';

/**
 * svc-bank — MULTI-CURRENCY ACCOUNTS OVER THE LEDGER (§8.1).
 *
 * This service is a PROJECTION, not a source of truth. It stores names,
 * policies, instructions and records of completed jobs. It stores no balance,
 * anywhere, and the three services below are wired so that it cannot start:
 * every "how much" question they answer goes to `LedgerClient`, and nothing in
 * this service writes a figure that a later read could mistake for one.
 *
 * The composition root is one function so the wiring is visible in one place —
 * including that `SpendAnalytics` gets a READ port over the ledger and no
 * writer at all.
 */

export interface BankServices {
  readonly spaces: SpaceService;
  readonly transfers: TransferService;
  readonly earn: EarnService;
  readonly analytics: SpendAnalytics;
}

export interface BankServiceOptions {
  /** Refused by earn pools — svc-token owns native staking (§8.1). */
  nativeAssetId?: string;
}

export function createBankServices(sql: Sql, ledger: LedgerClient, history: LedgerHistory, options: BankServiceOptions = {}): BankServices {
  const spaces = new SpaceService(sql, ledger);
  const transfers = new TransferService(sql, ledger, spaces);
  const earn = new EarnService(sql, ledger, { nativeAssetId: options.nativeAssetId ?? 'IFC' });
  const analytics = new SpendAnalytics(spaces, history);

  return { spaces, transfers, earn, analytics };
}

export { SpaceService, TransferService, EarnService, SpendAnalytics };
export { BankError, type BankErrorCode } from './errors.js';
export { accountForSpace, type SpaceRecord, type SpaceView } from './spaces/space-service.js';
export { planDue, occurrenceStart, dueOccurrence, type Cadence } from './transfers/schedule.js';
export { dailyInterest, planAccrual, accrualDate } from './earn/interest.js';
export { categorise, SPEND_CATEGORIES, type SpendCategory, type SpendSummary } from './analytics/spend.js';
export { memoryLedgerHistory, type LedgerHistory, type LedgerEntryRecord } from './analytics/ledger-history.js';
