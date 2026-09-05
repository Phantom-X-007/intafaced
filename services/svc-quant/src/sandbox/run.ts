import { parseAmount } from '@intafaced/ledger-client/money';
import type { SimulatedPerformanceStamp } from '@intafaced/quant-honesty';
import { QUANT_CASH_UNSET, QUANT_SANDBOX_SYNTAX, QuantError } from '../errors.js';
import { requireSimulatedStamp } from '../honesty.js';
import { createPaperBook, type PaperFill } from './book.js';
import { runIsolate, type IsolateLimits, type Language } from './isolate.js';

export interface SandboxRunInput {
  readonly language: Language;
  readonly source: string;
  readonly cash?: string | null;
  readonly environment?: string | null;
  readonly presentedAs?: string | null;
}

function requirePaperCash(cash: string | null | undefined): string {
  if (cash == null || cash.trim() === '') {
    throw new QuantError(QUANT_CASH_UNSET, 'cash is unset — paper bankroll is not invented as 10000');
  }
  return cash;
}

export type SandboxRunResult = SimulatedPerformanceStamp & {
  readonly ok: true;
  readonly language: Language;
  readonly logs: string[];
  readonly cash: string;
  readonly pnl: string;
  readonly fills: PaperFill[];
  readonly positions: { symbol: string; qty: string }[];
  readonly venue: 'internal';
  readonly venueVault: 'unset' | 'set';
};

export interface SandboxDeps {
  readonly wired: boolean;
  readonly venueVaultSet: boolean;
  readonly limits: IsolateLimits;
  readonly marks?: Readonly<Record<string, string>>;
}

export function runSandbox(input: SandboxRunInput, deps: SandboxDeps): SandboxRunResult {
  const stamp = requireSimulatedStamp(input.environment, input.presentedAs, ['paper', 'shadow']);
  const cash = requirePaperCash(input.cash);
  try {
    parseAmount(cash);
  } catch {
    throw new QuantError(QUANT_SANDBOX_SYNTAX, 'cash must be a decimal string');
  }
  const book = createPaperBook({
    startingCash: cash,
    venueVaultSet: deps.venueVaultSet,
    ...(deps.marks ? { marks: deps.marks } : {}),
  });
  const ran = runIsolate(input.language, input.source, book, deps.limits, deps.wired);
  return {
    ok: true,
    language: input.language,
    logs: [...ran.logs],
    cash: ran.cash,
    pnl: ran.pnl,
    fills: [...ran.fills],
    positions: [...ran.positions],
    venue: 'internal',
    venueVault: deps.venueVaultSet ? 'set' : 'unset',
    ...stamp,
  };
}
