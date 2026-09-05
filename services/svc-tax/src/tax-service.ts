import { formatAmount } from '@intafaced/ledger-client';
import {
  TAX_CLOSED_LOTS_UNINDEXED,
  TAX_COST_BASIS_UNAVAILABLE,
  TAX_DATA_LAKE_UNAVAILABLE,
  TAX_DATA_LAKE_UNPROBED,
  TAX_EXPORT_INCOMPLETE,
  TAX_INDEXER_UNAVAILABLE,
  TAX_INDEXER_UNPROBED,
  TAX_LOT_METHOD_REQUIRED,
  TaxError,
} from './codes.js';
import { parseJurisdictionMap, refuseExportCompleteness, requireMappedRegion, type JurisdictionMap } from './jurisdiction-map.js';
import type { TaxLedgerReads } from './ledger-reads.js';
import { isLotMethod, runLots, type LotMethod, type LotMovement } from './lots.js';

/**
 * Q-tax leftover — an env URL is not a live lake/indexer.
 *
 * Blank → `absent`. Set → `configured` (unprobed). Never `ok`: this process
 * does not query TSDB or the indexer, so a URL is config, not evidence.
 */
export type LakeStatus =
  | { readonly status: 'absent'; readonly code: typeof TAX_DATA_LAKE_UNAVAILABLE | typeof TAX_INDEXER_UNAVAILABLE }
  | { readonly status: 'configured'; readonly code: typeof TAX_DATA_LAKE_UNPROBED | typeof TAX_INDEXER_UNPROBED };

export interface TaxExportPreview {
  readonly empty: boolean;
  readonly complete: false;
  readonly lotMethod: LotMethod;
  readonly jurisdiction: string;
  readonly lotCount: number;
  readonly realized: string | null;
  readonly unrealized: string | null;
  readonly lake: LakeStatus;
  readonly indexer: LakeStatus;
  readonly residuals: string[];
}

export interface TaxExportPack extends TaxExportPreview {
  readonly filename: string;
  readonly mime: 'application/json';
  readonly bodyBase64: string;
}

export interface TaxServiceDeps {
  readonly mapRaw: string;
  readonly reads: TaxLedgerReads;
  readonly lake: LakeStatus;
  readonly indexer: LakeStatus;
  readonly now?: () => Date;
}

const HISTORY_YEARS = 10;

export class TaxService {
  private readonly map: JurisdictionMap;
  private readonly reads: TaxLedgerReads;
  private readonly lake: LakeStatus;
  private readonly indexer: LakeStatus;
  private readonly now: () => Date;

  constructor(deps: TaxServiceDeps) {
    this.map = parseJurisdictionMap(deps.mapRaw);
    this.reads = deps.reads;
    this.lake = deps.lake;
    this.indexer = deps.indexer;
    this.now = deps.now ?? (() => new Date());
  }

  async exportPreview(input: { userId: string; region: string; lotMethod: string; complete?: boolean }): Promise<TaxExportPreview> {
    const built = await this.build(input);
    return built.preview;
  }

  async exportPack(input: { userId: string; region: string; lotMethod: string; complete?: boolean }): Promise<TaxExportPack> {
    return this.build(input).then((built) => built.pack);
  }

  private requireMethod(raw: string): LotMethod {
    if (!isLotMethod(raw)) {
      throw new TaxError(TAX_LOT_METHOD_REQUIRED, 'Caller must select FIFO, LIFO, or HIFO — no silent default');
    }
    return raw;
  }

  private async build(input: { userId: string; region: string; lotMethod: string; complete?: boolean }): Promise<{
    preview: TaxExportPreview;
    pack: TaxExportPack;
  }> {
    refuseExportCompleteness(input.complete);
    const lotMethod = this.requireMethod(input.lotMethod);
    const jurisdiction = requireMappedRegion(this.map, input.region);
    const now = this.now();
    const range = {
      from: new Date(Date.UTC(now.getUTCFullYear() - HISTORY_YEARS, 0, 1)),
      to: now,
    };

    const balances = await this.reads.balances('user', input.userId);
    const available = balances.filter((b) => b.account.kind === 'available');
    const residuals = new Set<string>();
    residuals.add(TAX_CLOSED_LOTS_UNINDEXED);
    residuals.add(TAX_EXPORT_INCOMPLETE);

    const movements: LotMovement[] = [];
    for (const row of available) {
      const entries = await this.reads.history(row.account, range);
      for (const e of entries) {
        movements.push({
          assetId: row.account.assetId,
          side: e.direction === 'debit' ? 'acquire' : 'dispose',
          qty: e.amount,
          costBasis: null,
          proceeds: null,
          postedAt: e.postedAt,
          txId: e.txId,
          reason: e.reason,
        });
      }
    }

    if (movements.length > 0) residuals.add(TAX_COST_BASIS_UNAVAILABLE);

    const lots = runLots(movements, lotMethod);
    for (const r of lots.residuals) residuals.add(r);

    const empty = lots.lotsClosed.length === 0 && lots.lotsOpen.length === 0;
    const preview: TaxExportPreview = {
      empty,
      complete: false,
      lotMethod,
      jurisdiction,
      lotCount: lots.lotsClosed.length + lots.lotsOpen.length,
      realized: empty ? null : lots.realized,
      unrealized: empty ? null : lots.unrealized,
      lake: this.lake,
      indexer: this.indexer,
      residuals: [...residuals].sort(),
    };

    const body = {
      schema: 'intafaced.tax.export.v1',
      empty: preview.empty,
      complete: false as const,
      lotMethod,
      jurisdiction,
      lotsClosed: lots.lotsClosed,
      lotsOpen: lots.lotsOpen,
      realized: preview.realized,
      unrealized: preview.unrealized,
      lake: this.lake,
      indexer: this.indexer,
      residuals: preview.residuals,
      note: empty
        ? 'empty book — not a $0 PnL'
        : 'cost basis not on the ledger history wire; missing basis is unknown, not a FIFO/LIFO/HIFO invent or 0',
      currentAvailable: available.map((b) => ({
        assetId: b.account.assetId,
        amount: formatAmount(b.amount),
      })),
    };

    const json = `${JSON.stringify(body, null, 2)}\n`;
    const filename = `intafaced-tax-${jurisdiction}-${lotMethod}-${now.toISOString().slice(0, 10)}.json`;
    const pack: TaxExportPack = {
      ...preview,
      filename,
      mime: 'application/json',
      bodyBase64: Buffer.from(json, 'utf8').toString('base64'),
    };
    return { preview, pack };
  }
}

export function lakeStatusFromUrl(url: string | undefined): LakeStatus {
  if (!url || url.trim().length === 0) return { status: 'absent', code: TAX_DATA_LAKE_UNAVAILABLE };
  return { status: 'configured', code: TAX_DATA_LAKE_UNPROBED };
}

export function indexerStatusFromUrl(url: string | undefined): LakeStatus {
  if (!url || url.trim().length === 0) return { status: 'absent', code: TAX_INDEXER_UNAVAILABLE };
  return { status: 'configured', code: TAX_INDEXER_UNPROBED };
}
