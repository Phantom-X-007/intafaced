import { BrandMark } from '@/components/BrandMark';
import { GlareCard } from '@/components/ui/glare-card';
import { Crosshair } from '@phosphor-icons/react/dist/csr/Crosshair';
import { IdentificationCard } from '@phosphor-icons/react/dist/csr/IdentificationCard';
import { Moon } from '@phosphor-icons/react/dist/csr/Moon';
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
};

/**
 * Identity Blueprint - share acquisition card.
 * ONE grand pass in the middle (hero) + two example faces.
 * Hero art = night / "granny" flex (user pick) - flanks are founding + scout.
 */
const HERO: Seat = {
  id: 'night',
  rank: 'FOUNDING',
  title: 'Your Identity Blueprint',
  line: 'Session → reveal → first flex. One card you would actually post.',
  traits: [
    ['DECISION', 'Aggressive clarity'],
    ['RISK', 'Controlled fire'],
    ['ENERGY', 'Night session'],
    ['CREW', 'Caller / scout'],
  ],
  image: './media/identity/night.jpg',
  Icon: IdentificationCard,
};

const EXAMPLES: Seat[] = [
  {
    id: 'founding',
    rank: 'EXAMPLE',
    title: 'Founding energy',
    line: 'How a reveal can read at the top of the stack.',
    traits: [
      ['ENERGY', 'Prime hours'],
      ['MODE', 'Desk first'],
    ],
    image: './media/identity/founding.jpg',
    Icon: Moon,
  },
  {
    id: 'scout',
    rank: 'EXAMPLE',
    title: 'Crew role',
    line: 'How crew placement can show on the pass.',
    traits: [
      ['CREW', 'Caller'],
      ['LANE', 'Markets'],
    ],
    image: './media/identity/scout.jpg',
    Icon: Crosshair,
  },
];

function IdentityGlareCard({ seat, size }: { seat: Seat; size: 'hero' | 'example' }) {
  const hero = size === 'hero';
  return (
    <GlareCard
      containerClassName={
        hero
          ? 'max-w-none w-[min(94vw,540px)] sm:w-[500px] lg:w-[540px] xl:w-[580px]'
          : 'max-w-none w-[min(68vw,220px)] sm:w-[210px] lg:w-[230px]'
      }
      className="relative flex flex-col justify-end overflow-hidden p-0"
    >
      <img src={seat.image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050806] via-[#050806]/75 to-[#050806]/15" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_15%,rgba(196,240,0,0.12),transparent_55%)]" />

      <div className={['relative z-10 flex h-full flex-col justify-between', hero ? 'p-7 sm:p-8' : 'p-4 sm:p-5'].join(' ')}>
        <div className="flex items-start justify-between gap-3">
          <BrandMark compact markOnly />
          <span
            className={[
              'inline-flex items-center gap-1.5 border border-lime/45 bg-void/55 font-mono tracking-[0.14em] text-lime backdrop-blur-sm',
              hero ? 'px-2.5 py-1.5 text-[10px]' : 'px-2 py-1 text-[9px]',
            ].join(' ')}
          >
            <seat.Icon size={hero ? 14 : 12} weight="bold" />
            {seat.rank}
          </span>
        </div>

        <div>
          <p className={['font-mono tracking-[0.16em] text-lime', hero ? 'text-[11px]' : 'text-[9px]'].join(' ')}>IDENTITY BLUEPRINT</p>
          <h3 className={['mt-1.5 font-extrabold tracking-tight text-ink', hero ? 'text-3xl sm:text-4xl' : 'text-lg'].join(' ')}>
            {seat.title}
          </h3>
          <p className={['mt-2 text-mute', hero ? 'text-base' : 'text-xs'].join(' ')}>{seat.line}</p>
          <div className={['mt-4 grid grid-cols-2', hero ? 'gap-2.5' : 'gap-1.5'].join(' ')}>
            {seat.traits.map(([k, v]) => (
              <div
                key={k}
                className={['border border-white/12 bg-void/60 backdrop-blur-sm', hero ? 'px-3 py-2.5' : 'px-2 py-1.5'].join(' ')}
              >
                <span className={['block font-mono tracking-wider text-lime', hero ? 'text-[10px]' : 'text-[8px]'].join(' ')}>{k}</span>
                <span className={['font-semibold text-ink', hero ? 'text-sm' : 'text-[11px]'].join(' ')}>{v}</span>
              </div>
            ))}
          </div>
          {hero ? (
            <p className="mt-5 font-mono text-[10px] tracking-wider text-mute/90">Hover - foil glare · tilt · share-card shell</p>
          ) : null}
        </div>
      </div>
    </GlareCard>
  );
}

export function BlueprintCards() {
  return (
    <section id="blueprint" className="relative overflow-hidden border-y border-line bg-[#060a08] py-24 md:py-32">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_0%,rgba(196,240,0,0.07),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-lime">Identity Blueprint</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight md:text-5xl">
            Onboarding is not a form
            <br />
            It is the first flex
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-sm leading-relaxed text-mute md:text-base">
            Short session. Profile reveals. A share card you would post. The big card in the middle is the product. The two beside it are
            example faces of the same idea.
          </p>
        </div>

        {/* Grand card dead-center; flanks smaller and lower */}
        <div className="mt-16 grid grid-cols-1 items-end justify-items-center gap-8 lg:mt-20 lg:grid-cols-[1fr_auto_1fr] lg:gap-6 xl:gap-10">
          <div className="order-2 hidden justify-self-end lg:order-1 lg:block lg:pb-10">
            <IdentityGlareCard seat={EXAMPLES[0]!} size="example" />
          </div>

          <div className="order-1 z-20 lg:order-2">
            <IdentityGlareCard seat={HERO} size="hero" />
          </div>

          <div className="order-3 hidden justify-self-start lg:block lg:pb-10">
            <IdentityGlareCard seat={EXAMPLES[1]!} size="example" />
          </div>

          {/* Mobile examples under hero */}
          <div className="order-4 flex w-full flex-wrap justify-center gap-4 lg:hidden">
            <IdentityGlareCard seat={EXAMPLES[0]!} size="example" />
            <IdentityGlareCard seat={EXAMPLES[1]!} size="example" />
          </div>
        </div>
      </div>
    </section>
  );
}
