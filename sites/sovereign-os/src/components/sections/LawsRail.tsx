import { Coins } from '@phosphor-icons/react/dist/csr/Coins';
import { Key } from '@phosphor-icons/react/dist/csr/Key';
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning';
import type { ComponentType } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

const LAWS: {
  n: string;
  t: string;
  b: string;
  Icon: ComponentType<IconProps>;
  mark: string;
}[] = [
  {
    n: '01',
    t: 'Trade is one login',
    b: 'Spot, perps, options, OTC, borrow, spend. One identity. One rank. Every room.',
    Icon: Key,
    mark: 'KEY',
  },
  {
    n: '02',
    t: 'Every fill can pay you',
    b: 'Fee discounts. Mining. Staking. Referrals. Participation gets rewarded.',
    Icon: Coins,
    mark: 'FILL',
  },
  {
    n: '03',
    t: 'Exchange flow feeds the token',
    b: 'Fees, funding, launches. The community holds the upside.',
    Icon: Lightning,
    mark: 'FLOW',
  },
];

/**
 * Doctrine stack - manifesto rows with marks, not three feature boxes.
 */
export function LawsRail() {
  return (
    <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-20 md:px-6">
      <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">Three laws</h2>
      <p className="mt-2 max-w-[34ch] text-sm text-mute">Hard rules under every desk. Not a feature list.</p>

      <div className="mt-12">
        {LAWS.map((law) => (
          <article
            key={law.n}
            className="group grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-line py-10 last:border-b md:grid-cols-[5.5rem_3.5rem_1fr_auto] md:items-center md:gap-8"
          >
            <span
              className="font-mono text-[clamp(2.75rem,6vw,4.5rem)] font-black leading-none tracking-tighter text-lime/25 transition group-hover:text-lime/55"
              aria-hidden
            >
              {law.n}
            </span>

            <div className="flex h-12 w-12 items-center justify-center border border-line bg-void text-lime transition group-hover:border-lime/50 group-hover:bg-lime/10">
              <law.Icon size={22} weight="bold" />
            </div>

            <div className="min-w-0">
              <h3 className="text-xl font-bold tracking-tight text-ink md:text-2xl">{law.t}</h3>
              <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-mute md:text-[15px]">{law.b}</p>
            </div>

            <span className="hidden font-mono text-[10px] tracking-[0.2em] text-mute md:block">{law.mark}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
