import { GlareCard } from '@/components/ui/glare-card';
import { BrandMark } from '@/components/BrandMark';
import { IdentificationCard } from '@phosphor-icons/react/dist/csr/IdentificationCard';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
import { Crosshair } from '@phosphor-icons/react/dist/csr/Crosshair';
import type { ComponentType } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

type Seat = {
  id: string;
  rank: string;
  title: string;
  line: string;
  traits: [string, string][];
  image: string;
  Icon: ComponentType<IconProps>;
  featured?: boolean;
};

/**
 * Premium Blueprint section — Aceternity Glare Cards as sovereign identity seats.
 * Hover for Linear-style foil glare + 3D tilt. Swap images in public/media/identity/.
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
    featured: true,
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

function IdentityGlareCard({ seat }: { seat: Seat }) {
  return (
    <GlareCard className="relative flex flex-col justify-end overflow-hidden p-0">
      <img src={seat.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050806] via-[#050806]/75 to-[#050806]/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(196,240,0,0.12),transparent_55%)]" />

      <div className="relative z-10 flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between">
          <BrandMark compact markOnly className="opacity-90" />
          <span className="inline-flex items-center gap-1 border border-lime/40 bg-void/50 px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-lime backdrop-blur-sm">
            <seat.Icon size={12} weight="bold" />
            {seat.rank}
          </span>
        </div>

        <div>
          <p className="font-mono text-[10px] tracking-[0.16em] text-lime">SOVEREIGN BLUEPRINT</p>
          <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{seat.title}</h3>
          <p className="mt-1 text-sm text-mute">{seat.line}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {seat.traits.map(([k, v]) => (
              <div key={k} className="border border-white/10 bg-void/55 px-2 py-2 backdrop-blur-sm">
                <span className="block font-mono text-[9px] tracking-wider text-lime">{k}</span>
                <span className="text-xs font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[9px] tracking-wider text-mute/80">Hover - foil glare · tilt</p>
        </div>
      </div>
    </GlareCard>
  );
}

export function BlueprintCards() {
  return (
    <section id="blueprint" className="relative overflow-hidden border-y border-line py-20">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_70%_40%,rgba(196,240,0,0.06),transparent_60%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-lime">Blueprint</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
            Your seat on the desk
            <br />
            is the first flex
          </h2>
          <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-mute">
            Onboarding is not a form - it is an identity card you would actually post. Hover a card: foil glare and tilt like a physical
            pass. Swap the art later with your own stills.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap items-start justify-center gap-8 lg:justify-between">
          {SEATS.map((seat) => (
            <div key={seat.id} className={seat.featured ? 'lg:-mt-2' : 'lg:mt-6'}>
              <IdentityGlareCard seat={seat} />
            </div>
          ))}
        </div>

        <p className="mt-10 text-center font-mono text-[10px] tracking-wider text-mute">
          Drop custom art into <span className="text-ink">public/media/identity/</span> · founding · night · scout
        </p>
      </div>
    </section>
  );
}
