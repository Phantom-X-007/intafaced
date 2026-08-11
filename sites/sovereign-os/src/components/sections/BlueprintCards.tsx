import { BrandMark } from '@/components/BrandMark';
import { GlareCard } from '@/components/ui/glare-card';
import { Crosshair } from '@phosphor-icons/react/dist/csr/Crosshair';
import { IdentificationCard } from '@phosphor-icons/react/dist/csr/IdentificationCard';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import type { ComponentType } from 'react';
import { useState } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

type Seat = {
  id: string;
  rank: string;
  title: string;
  line: string;
  traits: [string, string][];
  image: string;
  Icon: ComponentType<IconProps>;
};

/**
 * Blueprint = card-game hand of Glare Cards (Aceternity Linear foil).
 * Keep GlareCard pure; this section only composes size, focus, and copy.
 * Art: public/media/identity/{id}.jpg — swap when Nitro drops Pinterest stills.
 */
const SEATS: Seat[] = [
  {
    id: 'founding',
    rank: 'FOUNDING',
    title: 'Desk seat',
    line: 'First wave. Trade-first access.',
    traits: [
      ['DECISION', 'Aggressive clarity'],
      ['RISK', 'Controlled fire'],
    ],
    image: './media/identity/founding.jpg',
    Icon: IdentificationCard,
  },
  {
    id: 'night',
    rank: 'NIGHT',
    title: 'Night session',
    line: 'When the book is loudest.',
    traits: [
      ['ENERGY', 'After hours'],
      ['MODE', 'Spot + perps'],
    ],
    image: './media/identity/night.jpg',
    Icon: Moon,
  },
  {
    id: 'scout',
    rank: 'SCOUT',
    title: 'Caller / scout',
    line: 'Find the edge. Bring the crew.',
    traits: [
      ['CREW', 'Caller'],
      ['LANE', 'Markets'],
    ],
    image: './media/identity/scout.jpg',
    Icon: Crosshair,
  },
];

function IdentityGlareCard({ seat, active, onFocus }: { seat: Seat; active: boolean; onFocus: () => void }) {
  return (
    <div
      className={[
        'origin-bottom transition duration-300 ease-out',
        active ? 'z-20 scale-105' : 'z-10 scale-[0.92] opacity-85 hover:opacity-100',
      ].join(' ')}
      onMouseEnter={onFocus}
      onFocus={onFocus}
    >
      <GlareCard
        containerClassName="max-w-none w-[min(92vw,400px)] sm:w-[380px] lg:w-[400px]"
        className="relative flex flex-col justify-end overflow-hidden p-0"
      >
        <img src={seat.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050806] via-[#050806]/70 to-[#050806]/15" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_15%,rgba(196,240,0,0.14),transparent_55%)]" />

        <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <BrandMark compact markOnly />
            <span className="inline-flex items-center gap-1.5 border border-lime/45 bg-void/55 px-2.5 py-1.5 font-mono text-[10px] tracking-[0.16em] text-lime backdrop-blur-sm">
              <seat.Icon size={14} weight="bold" />
              {seat.rank}
            </span>
          </div>

          <div>
            <p className="font-mono text-[11px] tracking-[0.18em] text-lime">SOVEREIGN BLUEPRINT</p>
            <h3 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-[2rem]">{seat.title}</h3>
            <p className="mt-2 text-base text-mute">{seat.line}</p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {seat.traits.map(([k, v]) => (
                <div key={k} className="border border-white/12 bg-void/60 px-3 py-2.5 backdrop-blur-sm">
                  <span className="block font-mono text-[10px] tracking-wider text-lime">{k}</span>
                  <span className="text-sm font-semibold text-ink">{v}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 font-mono text-[10px] tracking-wider text-mute/90">Move cursor - foil + tilt</p>
          </div>
        </div>
      </GlareCard>
    </div>
  );
}

export function BlueprintCards() {
  const [active, setActive] = useState(0);

  return (
    <section id="blueprint" className="relative overflow-hidden border-y border-line bg-[#060a08] py-24 md:py-28">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_0%,rgba(196,240,0,0.07),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-lime">Blueprint · identity seats</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">
            Your seat on the desk
            <br />
            is the first flex
          </h2>
          <p className="mx-auto mt-4 max-w-[40ch] text-sm leading-relaxed text-mute md:text-base">
            Not a form. A physical pass you would post. Hover a card for foil glare and tilt. Your Pinterest art swaps in later.
          </p>
        </div>

        {/* Card-game hand: large, fanned, active card pops */}
        <div className="mt-14 flex flex-col items-center gap-10 lg:mt-16 lg:flex-row lg:items-end lg:justify-center lg:gap-4 xl:gap-6">
          {SEATS.map((seat, i) => (
            <IdentityGlareCard key={seat.id} seat={seat} active={active === i} onFocus={() => setActive(i)} />
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {SEATS.map((seat, i) => (
            <button
              key={seat.id}
              type="button"
              onClick={() => setActive(i)}
              onMouseEnter={() => setActive(i)}
              className={[
                'font-mono text-[11px] uppercase tracking-[0.14em] transition',
                active === i ? 'text-lime' : 'text-mute hover:text-ink',
              ].join(' ')}
            >
              {seat.rank}
            </button>
          ))}
        </div>

        <p className="mt-8 text-center font-mono text-[10px] tracking-wider text-mute">
          Art slots ready · founding · night · scout · under <span className="text-ink">media/identity/</span>
        </p>
      </div>
    </section>
  );
}
