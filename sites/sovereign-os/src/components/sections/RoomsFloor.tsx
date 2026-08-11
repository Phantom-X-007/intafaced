import { DirectionAwareHover } from '@/components/ui/direction-aware-hover';
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
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ComponentType } from 'react';
import { useState } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

type Room = {
  code: string;
  name: string;
  role: string;
  body: string;
  points: string[];
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
  points: ['Real public market candles on this page', 'Depth + ticket in one frame', 'Pro multi-layout path next'],
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
    body: 'Verify once. Rank earned in any room counts in every room. Session to share-card is the flex.',
    points: ['Passkey-first path', 'Rank carries across rooms', 'Share card is the artifact'],
    image: `${MEDIA}/identity.jpg`,
    Icon: IdentificationCard,
    deg: 0,
  },
  {
    code: '02',
    name: 'Protocol',
    role: 'Self-custody · zero KYC by architecture',
    body: 'You hold the keys. Zero-KYC is not a loophole - it is the build. No withdrawal rights for us.',
    points: ['Non-custodial by design', 'Session keys you grant and revoke', 'Nothing fuzzy on custody'],
    image: `${MEDIA}/protocol.jpg`,
    Icon: ShieldCheck,
    deg: 30,
  },
  {
    code: '03',
    name: 'P2P',
    role: 'Street rails · escrow · 100+ currencies',
    body: 'Where banking rails fail, street rails win. Escrow-protected local liquidity.',
    points: ['Escrow on every deal', 'Local currency depth', 'Same identity, street settlement'],
    image: `${MEDIA}/p2p.jpg`,
    Icon: UsersThree,
    deg: 60,
  },
  {
    code: '04',
    name: 'Launch',
    role: 'Launchpad · meme factory · RWA',
    body: 'Raise and launch on the same key as the desk. Not a third-party casino tab.',
    points: ['Pad tied to house identity', 'Meme factory path', 'RWA lane on the same rails'],
    image: `${MEDIA}/launch.jpg`,
    Icon: RocketLaunch,
    deg: 90,
  },
  {
    code: '05',
    name: 'Bank',
    role: 'Accounts, loans, yield, cards',
    body: 'Fiat plane: we hold it, we say so. Double-entry on every movement. No cosplay custody.',
    points: ['Custodial and honest', 'Ledger recipes only', 'Cards and yield on the plane'],
    image: `${MEDIA}/bank.jpg`,
    Icon: Bank,
    deg: 120,
  },
  {
    code: '06',
    name: 'Pay',
    role: 'Gateway · routing · merchant',
    body: 'Merchant rails that settle into the same house. Routing you can audit, not a black box.',
    points: ['Gateway for merchants', 'Smart routing', 'Settles into house balance law'],
    image: `${MEDIA}/pay.jpg`,
    Icon: Lightning,
    deg: 150,
  },
  {
    code: '07',
    name: 'Predict',
    role: 'Real markets on real books',
    body: 'Prediction markets with real books - not a casino skin. Same risk grammar as the desk.',
    points: ['Real books', 'Clear settlement', 'Same identity and rank'],
    image: `${MEDIA}/predict.jpg`,
    Icon: Target,
    deg: 180,
  },
  {
    code: '08',
    name: 'Market',
    role: 'Bots, tools, data, strategies',
    body: 'The marketplace for tools that plug into the desk. Strategies and data - not random app spam.',
    points: ['Bots and strategies', 'Data products', 'Desk-native tools'],
    image: `${MEDIA}/market.jpg`,
    Icon: Storefront,
    deg: 210,
  },
  {
    code: '09',
    name: 'Academy',
    role: 'Lobbies, not lectures',
    body: 'Learn where traders hang. Lobbies and drills - not a course farm selling hope.',
    points: ['Lobby-first learning', 'Practice on house rails', 'Rank from skill, not slides'],
    image: `${MEDIA}/academy.jpg`,
    Icon: GraduationCap,
    deg: 240,
  },
  {
    code: '10',
    name: 'Token',
    role: 'Mine, stake, govern, burn',
    body: 'Fee flow feeds the community. Stake, govern, buyback - bloodstream, not a sticker.',
    points: ['Fee discounts', 'Stake and govern', 'Buybacks from real flow'],
    image: `${MEDIA}/token.jpg`,
    Icon: Network,
    deg: 270,
  },
  {
    code: '11',
    name: 'Core',
    role: 'Engine room · AI workforce',
    body: 'Ledger law under every trade. Agents work inside your limits - not a chatbot toy.',
    points: ['Recipes only', 'No balances outside ledger', 'Agents under risk caps'],
    image: `${MEDIA}/core.jpg`,
    Icon: Cpu,
    deg: 300,
  },
];

/**
 * House map: Trade core + orbit nodes.
 * Hover updates a rich bottom stage (image + doctrine) - not a thin text strip.
 */
export function RoomsFloor() {
  const [focus, setFocus] = useState<Room>(TRADE);
  const reduce = useReducedMotion();
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
            <p className="mt-2 max-w-[42ch] text-sm text-mute">
              Hover a room. The stage below is the room - image, job, and how it locks to the desk.
            </p>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">12 rooms · 1 key</p>
        </div>

        {/* Desktop orbital map */}
        <div className="relative mx-auto mt-14 hidden aspect-square w-full max-w-[560px] lg:block">
          <div className="pointer-events-none absolute inset-[12%] rounded-full border border-line/80" aria-hidden />
          <div className="pointer-events-none absolute inset-[28%] rounded-full border border-dashed border-line/50" aria-hidden />
          <div className="pointer-events-none absolute inset-0 rounded-full border border-line/40" aria-hidden />

          {/* spoke to active room */}
          {!isTrade ? (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-[1] h-px w-[38%] origin-left bg-gradient-to-r from-lime/50 to-transparent transition-transform duration-300"
              style={{
                transform: `rotate(${focus.deg - 90}deg)`,
              }}
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

        {/* Mobile / tablet chips */}
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

        {/* Stage - image + doctrine. Crossfades on hover. */}
        <div className="mt-12 border border-line bg-panel/40">
          <AnimatePresence mode="wait">
            <motion.div
              key={focus.code}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
            >
              <div className="relative min-h-[220px] border-b border-line md:min-h-[300px] md:border-b-0 md:border-r">
                <DirectionAwareHover
                  imageUrl={focus.image}
                  className="absolute inset-0 h-full w-full rounded-none"
                  imageClassName="opacity-90"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-lime">
                    {focus.code} · {focus.hot ? 'CORE' : 'ROOM'}
                  </span>
                  <p className="mt-1 text-lg font-extrabold tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">{focus.name}</p>
                </DirectionAwareHover>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void/80 via-transparent to-void/20 md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-void/40" />
              </div>

              <div className="flex flex-col justify-center px-5 py-6 sm:px-8 md:py-8">
                <p className="font-mono text-[10px] tracking-[0.16em] text-lime">
                  {focus.code} · {focus.hot ? 'CORE' : 'ROOM'}
                </p>
                <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-ink md:text-3xl">{focus.name}</h3>
                <p className="mt-1 text-sm font-medium text-mute">{focus.role}</p>
                <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-mute">{focus.body}</p>
                <ul className="mt-5 space-y-2">
                  {focus.points.map((p) => (
                    <li key={p} className="flex gap-2 border-l border-lime/35 pl-3 text-sm text-ink/90">
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  {focus.hot && focus.href ? (
                    <a
                      href={focus.href}
                      className="inline-flex bg-lime px-4 py-2.5 text-[11px] font-extrabold tracking-[0.06em] text-[#081008] active:scale-[0.98]"
                    >
                      OPEN TERMINAL
                    </a>
                  ) : (
                    <p className="font-mono text-[10px] uppercase tracking-wider text-mute">Same key as the desk · opens with the house</p>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
