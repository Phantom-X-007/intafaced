import { Bank } from '@phosphor-icons/react/dist/csr/Bank';
import { ChartLine } from '@phosphor-icons/react/dist/csr/ChartLine';
import { Cpu } from '@phosphor-icons/react/dist/csr/Cpu';
import { GraduationCap } from '@phosphor-icons/react/dist/csr/GraduationCap';
import { IdentificationCard } from '@phosphor-icons/react/dist/csr/IdentificationCard';
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning';
import { Network } from '@phosphor-icons/react/dist/csr/Network';
import { RocketLaunch } from '@phosphor-icons/react/dist/csr/RocketLaunch';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { Storefront } from '@phosphor-icons/react/dist/csr/Storefront';
import { Target } from '@phosphor-icons/react/dist/csr/Target';
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree';
import type { ComponentType } from 'react';
import { useState } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

type Room = {
  code: string;
  name: string;
  role: string;
  hot?: boolean;
  Icon: ComponentType<IconProps>;
  /** degrees on desktop ring */
  deg: number;
};

/** Trade at 0° is the core - others orbit (house metaphor, not a card rail) */
const ORBIT: Room[] = [
  { code: '00', name: 'Identity', role: 'One account, one rank, one wallet set', Icon: IdentificationCard, deg: 0 },
  { code: '02', name: 'Protocol', role: 'Self-custody · zero KYC by architecture', Icon: ShieldCheck, deg: 30 },
  { code: '03', name: 'P2P', role: 'Street rails · escrow · 100+ currencies', Icon: UsersThree, deg: 60 },
  { code: '04', name: 'Launch', role: 'Launchpad · meme factory · RWA', Icon: RocketLaunch, deg: 90 },
  { code: '05', name: 'Bank', role: 'Accounts, loans, yield, cards', Icon: Bank, deg: 120 },
  { code: '06', name: 'Pay', role: 'Gateway · routing · merchant', Icon: Lightning, deg: 150 },
  { code: '07', name: 'Predict', role: 'Real markets on real books', Icon: Target, deg: 180 },
  { code: '08', name: 'Market', role: 'Bots, tools, data, strategies', Icon: Storefront, deg: 210 },
  { code: '09', name: 'Academy', role: 'Lobbies, not lectures', Icon: GraduationCap, deg: 240 },
  { code: '10', name: 'Token', role: 'Mine, stake, govern, burn', Icon: Network, deg: 270 },
  { code: '11', name: 'Core', role: 'Engine room · AI workforce', Icon: Cpu, deg: 300 },
];

const TRADE: Room = {
  code: '01',
  name: 'Trade',
  role: 'Spot · perps · options · OTC · pro charts',
  hot: true,
  Icon: ChartLine,
  deg: 0,
};

/**
 * House map: Trade is the core node. Rooms are satellites + detail strip.
 * Zero card carousel.
 */
export function RoomsFloor() {
  const [focus, setFocus] = useState<Room>(TRADE);
  const isTrade = focus.code === TRADE.code;

  return (
    <section id="rooms" className="border-y border-line bg-[#060a08] py-20">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="max-w-[12ch] text-3xl font-extrabold tracking-tight md:text-4xl">
              Exchange at the core
              <br />
              rooms around it
            </h2>
            <p className="mt-2 max-w-[38ch] text-sm text-mute">
              The house is a map, not a grid of empty tiles. Hover a room. Trade sits in the middle.
            </p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">12 rooms · 1 key</p>
        </div>

        {/* Desktop orbital map */}
        <div className="relative mx-auto mt-14 hidden aspect-square w-full max-w-[560px] lg:block">
          {/* rings */}
          <div className="pointer-events-none absolute inset-[12%] rounded-full border border-line/80" aria-hidden />
          <div className="pointer-events-none absolute inset-[28%] rounded-full border border-dashed border-line/50" aria-hidden />
          <div className="pointer-events-none absolute inset-0 rounded-full border border-line/40" aria-hidden />

          {/* core TRADE */}
          <button
            type="button"
            onMouseEnter={() => setFocus(TRADE)}
            onFocus={() => setFocus(TRADE)}
            onClick={() => setFocus(TRADE)}
            className={[
              'absolute left-1/2 top-1/2 z-10 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border transition',
              isTrade
                ? 'border-lime bg-lime/15 text-ink shadow-[0_0_40px_rgba(196,240,0,0.18)]'
                : 'border-line bg-panel text-mute hover:border-lime/40 hover:text-ink',
            ].join(' ')}
          >
            <ChartLine size={28} weight="bold" className="text-lime" />
            <span className="mt-2 font-mono text-[10px] text-lime">01</span>
            <span className="text-sm font-extrabold tracking-tight">TRADE</span>
          </button>

          {ORBIT.map((room) => {
            const on = focus.code === room.code;
            const rad = ((room.deg - 90) * Math.PI) / 180;
            // place on outer ring (~44% radius of container)
            const r = 44;
            const x = 50 + r * Math.cos(rad);
            const y = 50 + r * Math.sin(rad);
            return (
              <button
                key={room.code}
                type="button"
                onMouseEnter={() => setFocus(room)}
                onFocus={() => setFocus(room)}
                onClick={() => setFocus(room)}
                style={{ left: `${x}%`, top: `${y}%` }}
                className={[
                  'absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[10px] tracking-wide transition',
                  on
                    ? 'bg-lime text-[#081008] shadow-[0_0_20px_rgba(196,240,0,0.25)]'
                    : 'border border-line bg-void/90 text-mute hover:border-lime/40 hover:text-ink',
                ].join(' ')}
              >
                <room.Icon size={12} weight="bold" />
                {room.name}
              </button>
            );
          })}
        </div>

        {/* Mobile / tablet: compact core + chip cloud (still not a card rail) */}
        <div className="mt-10 lg:hidden">
          <button
            type="button"
            onClick={() => setFocus(TRADE)}
            className="mx-auto flex w-full max-w-xs flex-col items-center justify-center border border-lime/40 bg-lime/10 px-6 py-8"
          >
            <ChartLine size={32} weight="bold" className="text-lime" />
            <span className="mt-2 font-mono text-[10px] text-lime">01 · CORE</span>
            <span className="text-lg font-extrabold">TRADE</span>
          </button>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ORBIT.map((room) => {
              const on = focus.code === room.code;
              return (
                <button
                  key={room.code}
                  type="button"
                  onClick={() => setFocus(room)}
                  className={[
                    'inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px]',
                    on ? 'bg-lime text-[#081008]' : 'border border-line text-mute',
                  ].join(' ')}
                >
                  <room.Icon size={12} weight="bold" />
                  {room.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail strip - single readout, not another card grid */}
        <div className="mt-12 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-lime">
              {focus.code} · {focus.hot ? 'CORE' : 'ROOM'}
            </p>
            <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{focus.name}</h3>
            <p className="mt-1 max-w-[40ch] text-sm text-mute">{focus.role}</p>
          </div>
          {focus.hot ? (
            <a
              href="#trade"
              className="inline-flex shrink-0 bg-lime px-4 py-2.5 text-[11px] font-extrabold tracking-[0.06em] text-[#081008] active:scale-[0.98]"
            >
              OPEN TERMINAL
            </a>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Same key as the desk</p>
          )}
        </div>
      </div>
    </section>
  );
}
