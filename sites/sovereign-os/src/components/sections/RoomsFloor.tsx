import { useState } from 'react';

const ROOMS = [
  { code: '01', name: 'Trade', role: 'Spot · perps · options · OTC · charts', hot: true, accent: 'from-lime/20' },
  { code: '00', name: 'Identity', role: 'One account, one rank, one wallet set', hot: false, accent: 'from-panel-2' },
  { code: '02', name: 'Protocol', role: 'Self-custody · zero KYC by architecture', hot: false, accent: 'from-panel-2' },
  { code: '03', name: 'P2P', role: 'Street rails · escrow · 100+ currencies', hot: false, accent: 'from-panel-2' },
  { code: '04', name: 'Launch', role: 'Launchpad · meme factory · RWA', hot: false, accent: 'from-panel-2' },
  { code: '05', name: 'Bank', role: 'Accounts, loans, yield, cards', hot: false, accent: 'from-panel-2' },
  { code: '06', name: 'Pay', role: 'Gateway · routing · merchant', hot: false, accent: 'from-panel-2' },
  { code: '07', name: 'Predict', role: 'Real markets on real books', hot: false, accent: 'from-panel-2' },
  { code: '08', name: 'Market', role: 'Bots, tools, data, strategies', hot: false, accent: 'from-panel-2' },
  { code: '09', name: 'Academy', role: 'Lobbies, not lectures', hot: false, accent: 'from-panel-2' },
  { code: '10', name: 'Token', role: 'Mine, stake, govern, burn', hot: false, accent: 'from-panel-2' },
  { code: '11', name: 'Core', role: 'Engine room · AI workforce', hot: false, accent: 'from-panel-2' },
] as const;

/** Horizontal trading-floor scroll - not empty bento soup */
export function RoomsFloor() {
  const [focus, setFocus] = useState(0);
  const room = ROOMS[focus]!;

  return (
    <section id="rooms" className="py-16">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <h2 className="max-w-[14ch] text-3xl font-extrabold tracking-tight md:text-4xl">
          Exchange at the core
          <br />
          rooms around it
        </h2>
        <p className="mt-2 max-w-[40ch] text-sm text-mute">Drag or scroll the floor. Hover a room to pin it. Trade leads the house.</p>
      </div>

      <div className="mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:px-6 [scrollbar-width:thin]">
        {ROOMS.map((r, i) => {
          const on = focus === i;
          return (
            <button
              key={r.code}
              type="button"
              onMouseEnter={() => setFocus(i)}
              onFocus={() => setFocus(i)}
              onClick={() => setFocus(i)}
              className={[
                'snap-start shrink-0 border text-left transition-all duration-300',
                on
                  ? 'w-[min(280px,80vw)] border-lime/50 bg-gradient-to-br from-lime/15 to-panel p-5'
                  : 'w-[160px] border-line bg-panel p-4 opacity-75 hover:opacity-100',
                r.hot && !on ? 'ring-1 ring-lime/30' : '',
              ].join(' ')}
            >
              <span className="font-mono text-[10px] text-lime">{r.code}</span>
              <h3 className={['mt-2 font-bold tracking-tight', on ? 'text-xl' : 'text-sm'].join(' ')}>{r.name}</h3>
              {on ? <p className="mt-2 text-xs leading-relaxed text-mute">{r.role}</p> : null}
              {on && r.hot ? (
                <a href="#trade" className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-lime hover:underline">
                  Open terminal →
                </a>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mt-4 max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <p className="font-mono text-[11px] text-mute">
          Focused: <span className="text-ink">{room.name}</span> · {room.role}
        </p>
      </div>
    </section>
  );
}
