import { Cube } from '@phosphor-icons/react/dist/csr/Cube';
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { TreeStructure } from '@phosphor-icons/react/dist/csr/TreeStructure';
import type { ComponentType } from 'react';
import { useState } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

const STEPS: {
  p: string;
  t: string;
  badge: string;
  d: string;
  Icon: ComponentType<IconProps>;
}[] = [
  {
    p: 'P0',
    t: 'Contracts on proven rails',
    badge: 'near-term',
    d: 'Ship on rails that already settle. No fantasy chain day-one.',
    Icon: ShieldCheck,
  },
  { p: 'P1', t: 'Our own chain', badge: 'roadmap', d: 'INTACHAIN as the settlement ground under the house.', Icon: Cube },
  { p: 'P2', t: 'Performance core', badge: 'roadmap', d: 'Throughput for the full exchange + rooms load.', Icon: Lightning },
  { p: 'P3', t: 'Progressive decentralisation', badge: 'roadmap', d: 'Hardening without the cosplay. Step by step.', Icon: TreeStructure },
];

/** Dense interactive path - no thin rail floating in void */
export function ChainTimeline() {
  const [active, setActive] = useState(0);
  const step = STEPS[active]!;

  return (
    <section className="border-y border-line bg-panel/40 py-16 md:py-20">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="max-w-[16ch] text-2xl font-extrabold tracking-tight md:text-3xl">Not a tenant on somebody else&apos;s chain</h2>
            <p className="mt-2 max-w-[40ch] text-sm text-mute">Settlement path under the house. Near-term first.</p>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-lime">INTACHAIN · PATH</span>
        </div>

        <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const on = active === i;
            return (
              <button
                key={s.p}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className={[
                  'border p-4 text-left transition',
                  on ? 'border-lime/50 bg-lime/10' : 'border-line bg-void hover:border-mute/40',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <s.Icon size={20} weight="bold" className={on ? 'text-lime' : 'text-mute'} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-mute">{s.badge}</span>
                </div>
                <p className="mt-3 font-mono text-xs text-lime">{s.p}</p>
                <h3 className="mt-1 text-sm font-bold text-ink">{s.t}</h3>
              </button>
            );
          })}
        </div>

        <div className="mt-4 border border-line bg-void px-5 py-4">
          <p className="font-mono text-[10px] tracking-[0.14em] text-lime">{step.p}</p>
          <p className="mt-1 text-base text-ink">{step.d}</p>
        </div>
      </div>
    </section>
  );
}
