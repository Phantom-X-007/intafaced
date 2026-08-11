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
import { useEffect, useState } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

type Room = {
  code: string;
  name: string;
  role: string;
  body: string;
  image: string;
  hot?: boolean;
  href?: string;
  Icon: ComponentType<IconProps>;
  deg: number;
};

const MEDIA = './media/rooms';

const TRADE: Room = {
  code: '01',
  name: 'Trade',
  role: 'Spot · perps · options · OTC · pro charts',
  body: 'The desk is the product. One terminal for every market type - not a bank page with charts bolted on.',
  image: `${MEDIA}/trade.jpg`,
  hot: true,
  href: '#trade',
  Icon: ChartLine,
  deg: 0,
};

const ORBIT: Room[] = [
  {
    code: '00',
    name: 'Identity',
    role: 'One account, one rank, one wallet set',
    body: 'Verify once. Rank earned in any room counts in every room.',
    image: `${MEDIA}/identity.jpg`,
    Icon: IdentificationCard,
    deg: 0,
  },
  {
    code: '02',
    name: 'Protocol',
    role: 'Self-custody · zero KYC by architecture',
    body: 'You hold the keys. Zero-KYC is the build - not a loophole.',
    image: `${MEDIA}/protocol.jpg`,
    Icon: ShieldCheck,
    deg: 30,
  },
  {
    code: '03',
    name: 'P2P',
    role: 'Street rails · escrow · 100+ currencies',
    body: 'Where banking rails fail, street rails win. Escrow-protected local liquidity.',
    image: `${MEDIA}/p2p.jpg`,
    Icon: UsersThree,
    deg: 60,
  },
  {
    code: '04',
    name: 'Launch',
    role: 'Launchpad · meme factory · RWA',
    body: 'Raise and launch on the same key as the desk.',
    image: `${MEDIA}/launch.jpg`,
    Icon: RocketLaunch,
    deg: 90,
  },
  {
    code: '05',
    name: 'Bank',
    role: 'Accounts, loans, yield, cards',
    body: 'Fiat plane: we hold it, we say so. Double-entry always.',
    image: `${MEDIA}/bank.jpg`,
    Icon: Bank,
    deg: 120,
  },
  {
    code: '06',
    name: 'Pay',
    role: 'Gateway · routing · merchant',
    body: 'Merchant rails that settle into the same house.',
    image: `${MEDIA}/pay.jpg`,
    Icon: Lightning,
    deg: 150,
  },
  {
    code: '07',
    name: 'Predict',
    role: 'Real markets on real books',
    body: 'Prediction markets with real books - not a casino skin.',
    image: `${MEDIA}/predict.jpg`,
    Icon: Target,
    deg: 180,
  },
  {
    code: '08',
    name: 'Market',
    role: 'Bots, tools, data, strategies',
    body: 'Tools that plug into the desk - strategies and data, not app spam.',
    image: `${MEDIA}/market.jpg`,
    Icon: Storefront,
    deg: 210,
  },
  {
    code: '09',
    name: 'Academy',
    role: 'Lobbies, not lectures',
    body: 'Learn where traders hang. Lobbies and drills - not a course farm.',
    image: `${MEDIA}/academy.jpg`,
    Icon: GraduationCap,
    deg: 240,
  },
  {
    code: '10',
    name: 'Token',
    role: 'Mine, stake, govern, burn',
    body: 'Fee flow feeds the community. Bloodstream, not a sticker.',
    image: `${MEDIA}/token.jpg`,
    Icon: Network,
    deg: 270,
  },
  {
    code: '11',
    name: 'Core',
    role: 'Engine room · AI workforce',
    body: 'Ledger law under every trade. Agents work inside your limits.',
    image: `${MEDIA}/core.jpg`,
    Icon: Cpu,
    deg: 300,
  },
];

const ALL_ROOMS: Room[] = [TRADE, ...ORBIT];

/**
 * House map: Trade core + orbit.
 * Bottom stage: room photo is clearly visible (right side open), text on a soft left scrim.
 * Preloaded stack + CSS opacity only - no wait-mode crossfade lag.
 */
export function RoomsFloor() {
  const [focus, setFocus] = useState<Room>(TRADE);
  const isTrade = focus.code === TRADE.code;

  // Warm the cache so first hover is instant
  useEffect(() => {
    for (const room of ALL_ROOMS) {
      const img = new Image();
      img.src = room.image;
    }
  }, []);

  return (
    <section id="rooms" className="relative overflow-hidden border-y border-line bg-[#060a08] py-20">
      <div className="relative z-[1] mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="max-w-[12ch] text-3xl font-extrabold tracking-tight md:text-4xl">
              Exchange at the core
              <br />
              rooms around it
            </h2>
            <p className="mt-2 max-w-[42ch] text-sm text-mute">
              Hover a room. Trade stays the core. The scene below switches with the room - picture and words together.
            </p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">12 rooms · 1 key</p>
        </div>

        {/* Desktop orbital map */}
        <div className="relative mx-auto mt-14 hidden aspect-square w-full max-w-[560px] lg:block">
          <div className="pointer-events-none absolute inset-[12%] rounded-full border border-line/80" aria-hidden />
          <div className="pointer-events-none absolute inset-[28%] rounded-full border border-dashed border-line/50" aria-hidden />
          <div className="pointer-events-none absolute inset-0 rounded-full border border-line/40" aria-hidden />

          {!isTrade ? (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-px w-[38%] origin-left bg-gradient-to-r from-lime/45 to-transparent transition-transform duration-300"
              style={{ transform: `rotate(${focus.deg - 90}deg)` }}
              aria-hidden
            />
          ) : null}

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
                    ? 'scale-110 bg-lime text-[#081008] shadow-[0_0_20px_rgba(196,240,0,0.25)]'
                    : 'border border-line bg-void/90 text-mute hover:border-lime/40 hover:text-ink',
                ].join(' ')}
              >
                <room.Icon size={12} weight="bold" />
                {room.name}
              </button>
            );
          })}
        </div>

        {/* Mobile chips */}
        <div className="mt-10 lg:hidden">
          <button
            type="button"
            onClick={() => setFocus(TRADE)}
            className={[
              'mx-auto flex w-full max-w-xs flex-col items-center justify-center border px-6 py-8',
              isTrade ? 'border-lime/40 bg-lime/10' : 'border-line bg-panel',
            ].join(' ')}
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

        {/*
          Room stage: photo clearly visible (esp. right half), text on soft left wash.
          All images stacked + opacity swap = snappy, no decode lag / wait-mode flash.
        */}
        <div className="relative mt-12 min-h-[260px] overflow-hidden border border-line md:min-h-[300px]">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {ALL_ROOMS.map((room) => (
              <img
                key={room.code}
                src={room.image}
                alt=""
                className={[
                  'absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-200 ease-out',
                  focus.code === room.code ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
                loading="eager"
                decoding="async"
                draggable={false}
              />
            ))}
            {/* Left: keep copy readable. Right: let the photo read. */}
            <div className="absolute inset-0 bg-gradient-to-r from-void from-0% via-void/85 via-40% to-void/20 to-100%" />
            <div className="absolute inset-0 bg-gradient-to-t from-void/55 via-transparent to-void/25" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_70%_at_85%_45%,rgba(196,240,0,0.08),transparent_55%)]" />
          </div>

          <div className="relative z-[1] flex min-h-[260px] flex-col justify-between gap-6 px-5 py-8 sm:flex-row sm:items-end sm:px-8 md:min-h-[300px] md:py-10">
            <div className="max-w-md rounded-[2px] border border-white/5 bg-void/35 p-4 backdrop-blur-[2px] sm:max-w-lg sm:p-5">
              <p className="font-mono text-[10px] tracking-[0.16em] text-lime">
                {focus.code} · {focus.hot ? 'CORE' : 'ROOM'}
              </p>
              <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-ink md:text-3xl">{focus.name}</h3>
              <p className="mt-1 text-sm font-medium text-mute">{focus.role}</p>
              <p className="mt-3 max-w-[42ch] text-[15px] leading-relaxed text-ink/85">{focus.body}</p>
              {!focus.hot ? (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-mute/80">
                  Same key as the desk · these rooms open with the house
                </p>
              ) : null}
            </div>
            <div className="shrink-0">
              {focus.hot && focus.href ? (
                <a
                  href={focus.href}
                  className="inline-flex bg-lime px-4 py-2.5 text-[11px] font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_24px_rgba(196,240,0,0.15)] active:scale-[0.98]"
                >
                  OPEN TERMINAL
                </a>
              ) : (
                <span className="inline-flex border border-line/80 bg-void/55 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-mute backdrop-blur-sm">
                  House room
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
