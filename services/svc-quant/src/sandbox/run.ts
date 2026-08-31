import { parseAmount } from '@intafaced/ledger-client/money';
import type { SimulatedPerformanceStamp } from '@intafaced/quant-honesty';
import { QUANT_SANDBOX_SYNTAX, QuantError } from '../errors.js';
import { requireSimulatedStamp } from '../honesty.js';
import { createPaperBook, type PaperFill } from './book.js';
import { runIsolate, type IsolateLimits, type Language } from './isolate.js';

export interface SandboxRunInput {
  readonly language: Language;
  readonly source: string;
  readonly cash: string;
  readonly environment?: string | null;
  readonly presentedAs?: string | null;
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
  try {
    parseAmount(input.cash);
  } catch {
    throw new QuantError(QUANT_SANDBOX_SYNTAX, 'cash must be a decimal string');
  }
  const book = createPaperBook({
    startingCash: input.cash,
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
