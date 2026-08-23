import { parseAmount } from '@intafaced/ledger-client/money';
import { QUANT_STUDIO_RISK_BLOCK_REQUIRED, QuantError } from '../errors.js';
import type { SavedStrategy, StudioBlock, StudioRiskBlock, StudioStore } from './store.js';

export interface StudioSaveInput {
  readonly name: string;
  readonly blocks: readonly StudioBlock[];
  readonly risk?: Partial<StudioRiskBlock> | null;
  readonly cash: string;
}

function completeRisk(risk: Partial<StudioRiskBlock> | null | undefined): StudioRiskBlock | null {
  if (!risk) return null;
  const maxDrawdown = risk.maxDrawdown?.trim() ?? '';
  const maxNotional = risk.maxNotional?.trim() ?? '';
  const kill = risk.kill?.trim() ?? '';
  if (!maxDrawdown || !maxNotional || !kill) return null;
  return { maxDrawdown, maxNotional, kill };
}

function decimalField(raw: string, field: string): string {
  try {
    parseAmount(raw);
  } catch {
    throw new QuantError('quant.params_invalid', `${field} must be a decimal string`);
  }
  return raw;
}

export function compileStudioSource(blocks: StudioBlock[]): string {
  return blocks.map((block) => `oms.${block.side}(${JSON.stringify(block.symbol)}, ${JSON.stringify(block.qty)});`).join('\n');
}

export function saveStudio(input: StudioSaveInput, store: StudioStore): SavedStrategy {
  const risk = completeRisk(input.risk ?? null);
  if (!risk) {
    throw new QuantError(
      QUANT_STUDIO_RISK_BLOCK_REQUIRED,
      'studio.save requires a risk block (maxDrawdown / maxNotional / kill as decimal strings)',
    );
  }

  const name = input.name.trim();
  if (!name) throw new QuantError('quant.params_invalid', 'name is required');
  if (input.blocks.length < 1) throw new QuantError('quant.params_invalid', 'at least one block is required');

  decimalField(risk.maxDrawdown, 'maxDrawdown');
  decimalField(risk.maxNotional, 'maxNotional');
  decimalField(risk.kill, 'kill');
  const cash = decimalField(input.cash, 'cash');

  const blocks: StudioBlock[] = input.blocks.map((block, i) => {
    const symbol = block.symbol.trim();
    if (!symbol) throw new QuantError('quant.params_invalid', `blocks[${i}].symbol is required`);
    const qty = decimalField(block.qty, `blocks[${i}].qty`);
    if (parseAmount(qty) <= 0n) {
      throw new QuantError('quant.params_invalid', `blocks[${i}].qty must be a positive decimal string`);
    }
    return { side: block.side, symbol, qty };
  });

  const saved: SavedStrategy = {
    id: `studio_${crypto.randomUUID()}`,
    name,
    language: 'javascript',
    source: compileStudioSource(blocks),
    cash,
    blocks,
    risk,
  };
  return store.save(saved);
}
