import { useState } from 'react';

/** Demo order ticket — terminal chrome only. */

export function OrderTicket() {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('limit');

  return (
    <div className="border-t border-line bg-[#040705] p-3 font-mono text-[11px] md:border-l md:border-t-0">
      <div className="mb-2 flex gap-1">
        {(
          [
            ['buy', 'Buy'],
            ['sell', 'Sell'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSide(id)}
            className={
              side === id
                ? id === 'buy'
                  ? 'flex-1 bg-lime py-2 font-bold text-[#081008]'
                  : 'flex-1 bg-danger py-2 font-bold text-ink'
                : 'flex-1 border border-line py-2 text-mute'
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-1">
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
          value={type === 'market' ? 'Market' : '67,412.2'}
          className="w-full border border-line bg-panel px-2 py-2 text-ink outline-none"
        />
      </label>
      <label className="mb-3 block">
        <span className="mb-1 block text-[9px] uppercase tracking-wider text-mute">Size (BTC)</span>
        <input readOnly value="0.10" className="w-full border border-line bg-panel px-2 py-2 text-ink outline-none" />
      </label>
      <button
        type="button"
        className={
          side === 'buy'
            ? 'w-full bg-lime py-2.5 text-xs font-extrabold tracking-wide text-[#081008]'
            : 'w-full bg-danger py-2.5 text-xs font-extrabold tracking-wide text-ink'
        }
      >
        {side === 'buy' ? 'BUY BTC-PERP' : 'SELL BTC-PERP'} · DEMO
      </button>
      <p className="mt-2 text-center text-[9px] text-mute">Illustrative ticket — no orders placed.</p>
    </div>
  );
}
