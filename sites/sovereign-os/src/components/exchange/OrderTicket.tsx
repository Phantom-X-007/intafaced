import { useState } from 'react';

type Props = {
  buyLabel: string;
  sellLabel: string;
  sizeLabel: string;
  size: string;
  price: string;
  note: string;
  /** Tighter padding when stacked under book in the right rail */
  compact?: boolean;
};

export function OrderTicket({ buyLabel, sellLabel, sizeLabel, size, price, note, compact }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('limit');

  return (
    <div
      className={
        compact ? 'border-line bg-[#040705] p-2.5 font-mono text-[11px]' : 'border-t border-line bg-[#040705] p-3 font-mono text-[11px]'
      }
    >
      <div className="mb-2 flex gap-1">
        {(
          [
            ['buy', buyLabel],
            ['sell', sellLabel],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSide(id)}
            className={
              side === id
                ? id === 'buy'
                  ? 'flex-1 bg-lime py-2 text-[10px] font-bold text-[#081008]'
                  : 'flex-1 bg-danger py-2 text-[10px] font-bold text-ink'
                : 'flex-1 border border-line py-2 text-[10px] text-mute'
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-2 flex gap-1">
        {(
          [
            ['limit', 'Limit'],
            ['market', 'Market'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setType(id)}
            className={
              type === id ? 'flex-1 border border-lime/40 bg-panel py-1.5 text-lime' : 'flex-1 border border-line py-1.5 text-mute'
            }
          >
            {label}
          </button>
        ))}
      </div>
      <label className="mb-2 block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-mute">Price</span>
        <input
          readOnly
          value={type === 'market' ? 'Market' : price}
          className="w-full border border-line bg-panel px-2 py-1.5 text-ink outline-none"
        />
      </label>
      <label className="mb-2 block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-mute">{sizeLabel}</span>
        <input readOnly value={size} className="w-full border border-line bg-panel px-2 py-1.5 text-ink outline-none" />
      </label>
      <button
        type="button"
        className={
          side === 'buy'
            ? 'w-full bg-lime py-2.5 text-[10px] font-extrabold tracking-wide text-[#081008]'
            : 'w-full bg-danger py-2.5 text-[10px] font-extrabold tracking-wide text-ink'
        }
      >
        {side === 'buy' ? buyLabel : sellLabel} · DEMO
      </button>
      <p className="mt-1.5 text-center text-[9px] text-mute">{note}</p>
    </div>
  );
}
