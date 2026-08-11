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
  objectClass?: string;
};

/**
 * Identity Blueprint - share acquisition card.
 * Granny hero center. Side examples stay quiet: tiny chrome, max face/grill visible.
 * Shared void wash so bunny / granny / scout read as one set, not three loud posters.
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
  image: './media/identity/granny-hero-v2.jpg',
  Icon: IdentificationCard,
  objectClass: 'object-cover object-[center_36%]',
};

const EXAMPLES: Seat[] = [
  {
    id: 'bunny',
    rank: 'EXAMPLE',
    title: 'Flex energy',
    line: 'Loud house energy on the pass.',
    traits: [
      ['ENERGY', 'Peak flex'],
      ['MODE', 'Show card'],
    ],
    image: './media/identity/bunny-grillz-v2.jpg',
    Icon: Moon,
    // Keep grillz in the clear mid-frame (UI only hugs the bottom edge)
    objectClass: 'object-cover object-[center_32%]',
  },
  {
    id: 'scout',
    rank: 'EXAMPLE',
    title: 'Crew role',
    line: 'Crew placement on the pass.',
    traits: [
      ['CREW', 'Caller'],
      ['LANE', 'Markets'],
    ],
    image: './media/identity/crew-scout-v2.jpg',
    Icon: Crosshair,
    objectClass: 'object-cover object-[center_30%]',
  },
];

function IdentityGlareCard({ seat, size }: { seat: Seat; size: 'hero' | 'example' }) {
  const hero = size === 'hero';
  const objectClass = seat.objectClass ?? 'object-cover object-center';

  return (
    <GlareCard
      containerClassName={
        hero ? '!max-w-none w-[min(92vw,540px)] sm:w-[500px] lg:w-[520px]' : '!max-w-none w-[180px] sm:w-[190px] lg:w-[200px]'
      }
      className="relative flex flex-col justify-end overflow-hidden p-0"
    >
      <img
        src={seat.image}
        alt=""
        className={['absolute inset-0 h-full w-full', objectClass].join(' ')}
        loading={hero ? 'eager' : 'lazy'}
        decoding="async"
      />

      {/* Shared brand grade - pulls all three into the same void/lime family */}
      <div className="absolute inset-0 bg-[#050806]/35" aria-hidden />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(10,18,12,0.15),transparent_70%)]" aria-hidden />
      {/* Bottom-only type scrim - thin so mid-frame (grillz / face) stays open */}
      <div
        className={[
          'absolute inset-x-0 bottom-0',
          hero
            ? 'h-[48%] bg-gradient-to-t from-[#050806] via-[#050806]/80 to-transparent'
            : 'h-[34%] bg-gradient-to-t from-[#050806] via-[#050806]/75 to-transparent',
        ].join(' ')}
        aria-hidden
      />

      <div className={['relative z-10 flex h-full flex-col justify-between', hero ? 'p-6 sm:p-7' : 'p-2.5 sm:p-3'].join(' ')}>
        <div className="flex items-start justify-between gap-2">
          <BrandMark compact markOnly />
          <span
            className={[
              'inline-flex items-center gap-1 border border-lime/25 bg-void/45 font-mono tracking-[0.12em] text-lime/85 backdrop-blur-[2px]',
              hero ? 'px-2 py-1 text-[10px]' : 'px-1.5 py-0.5 text-[8px]',
            ].join(' ')}
          >
            <seat.Icon size={hero ? 12 : 10} weight="bold" />
            {seat.rank}
          </span>
        </div>

        <div className={hero ? '' : 'mt-auto'}>
          {hero ? <p className="font-mono text-[10px] tracking-[0.16em] text-lime/80">IDENTITY BLUEPRINT</p> : null}
          <h3
            className={['font-extrabold tracking-tight text-ink', hero ? 'mt-1.5 text-3xl sm:text-4xl' : 'text-[13px] leading-tight'].join(
              ' ',
            )}
          >
            {seat.title}
          </h3>
          {hero ? <p className="mt-2 text-sm text-mute md:text-base">{seat.line}</p> : null}

          {hero ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {seat.traits.map(([k, v]) => (
                <div key={k} className="border border-white/[0.08] bg-void/45 px-2.5 py-2 backdrop-blur-[2px]">
                  <span className="block font-mono text-[9px] tracking-wider text-lime/75">{k}</span>
                  <span className="text-xs font-semibold text-ink/90">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            /* Side cards: one compact strip - does not bury grillz / face */
            <div className="mt-1.5 flex flex-wrap gap-1">
              {seat.traits.map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex max-w-full items-center gap-1 border border-white/[0.07] bg-void/40 px-1.5 py-0.5 font-mono text-[7px] tracking-wide text-mute backdrop-blur-[1px]"
                >
                  <span className="text-lime/70">{k}</span>
                  <span className="truncate text-ink/80">{v}</span>
                </span>
              ))}
            </div>
          )}

          {hero ? (
            <p className="mt-4 font-mono text-[10px] tracking-wider text-mute/80">Hover - foil glare · tilt · share-card shell</p>
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
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_50%_at_50%_0%,rgba(196,240,0,0.05),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-4 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-lime/90">Identity Blueprint</p>
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

        <div className="mt-16 flex w-full flex-col items-center lg:mt-20">
          <div className="flex w-full max-w-[1100px] items-end justify-center">
            <div className="hidden w-[220px] shrink-0 items-end justify-end pb-10 pr-2 lg:flex xl:w-[240px] xl:pr-4">
              <IdentityGlareCard seat={EXAMPLES[0]!} size="example" />
            </div>

            <div className="relative z-20 shrink-0">
              <IdentityGlareCard seat={HERO} size="hero" />
            </div>

            <div className="hidden w-[220px] shrink-0 items-end justify-start pb-10 pl-2 lg:flex xl:w-[240px] xl:pl-4">
              <IdentityGlareCard seat={EXAMPLES[1]!} size="example" />
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:hidden">
            <IdentityGlareCard seat={EXAMPLES[0]!} size="example" />
            <IdentityGlareCard seat={EXAMPLES[1]!} size="example" />
          </div>
        </div>
      </div>
    </section>
  );
}
