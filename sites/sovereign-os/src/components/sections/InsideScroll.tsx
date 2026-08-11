import { useState } from 'react';
import { ChartLine } from '@phosphor-icons/react/dist/csr/ChartLine';
import { Cpu } from '@phosphor-icons/react/dist/csr/Cpu';
import { CurrencyCircleDollar } from '@phosphor-icons/react/dist/csr/CurrencyCircleDollar';
import { Bank } from '@phosphor-icons/react/dist/csr/Bank';
import { UsersThree } from '@phosphor-icons/react/dist/csr/UsersThree';
import { Robot } from '@phosphor-icons/react/dist/csr/Robot';
import { Lightning } from '@phosphor-icons/react/dist/csr/Lightning';
import { Scales } from '@phosphor-icons/react/dist/csr/Scales';
import type { ComponentType } from 'react';

type IconProps = { size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; className?: string };

const CHAPTERS: {
  id: string;
  t: string;
  b: string;
  d: string;
  Icon: ComponentType<IconProps>;
}[] = [
  {
    id: 'match',
    t: 'Matching & risk',
    b: 'Own books, margin engine, liquidation, smart router.',
    d: 'Exchange spine first - venue fabric on our rails, not a borrowed stack with a skin.',
    Icon: Scales,
  },
  {
    id: 'charts',
    t: 'Pro charting',
    b: 'Drawings, indicators, multi-layout for power traders.',
    d: 'Licensed pro chart path in progress. What you see on this site is market OHLC, not a toy sine wave.',
    Icon: ChartLine,
  },
  {
    id: 'exec',
    t: 'Execution empire',
    b: 'Algos, arb, MM, cross-venue brain.',
    d: 'Order path we own. Not a middleman API dressed as product.',
    Icon: Lightning,
  },
  {
    id: 'bank',
    t: 'Sovereign banking',
    b: 'Zero KYC by architecture on the protocol plane.',
    d: 'Fiat plane stays custodial and said out loud. No cosplay.',
    Icon: Bank,
  },
  {
    id: 'p2p',
    t: 'P2P',
    b: 'Where banking rails fail, street rails win.',
    d: 'Escrow-protected. 100+ currencies. Street liquidity.',
    Icon: UsersThree,
  },
  {
    id: 'agents',
    t: 'Agents',
    b: 'Scanner, portfolio, copy-intel inside your limits.',
    d: 'Workforce for the desk - not a chatbot toy bolted on.',
    Icon: Robot,
  },
  {
    id: 'token',
    t: 'Token',
    b: 'Fee discounts, staking, buybacks on exchange flow.',
    d: 'Every fill can feed community upside. Token is bloodstream, not a sticker.',
    Icon: CurrencyCircleDollar,
  },
  {
    id: 'core',
    t: 'Core',
    b: 'Ledger law under every trade.',
    d: 'Recipes only. No balances outside the book. Ever.',
    Icon: Cpu,
  },
];

/**
 * Dense 2×4 system map - fills the frame, no dead right column of void.
 */
export function InsideScroll() {
  const [active, setActive] = useState(0);
  const ch = CHAPTERS[active]!;

  return (
    <section id="inside" className="border-t border-line bg-panel/30 py-16 md:py-20">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Inside the house</h2>
            <p className="mt-2 max-w-[44ch] text-sm text-mute">Hover a cell. Depth without empty black.</p>
          </div>
          <span className="font-mono text-[10px] tracking-wider text-mute">8 SYSTEMS · 1 KEY</span>
        </div>

        <div className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CHAPTERS.map((item, i) => {
            const on = active === i;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className={[
                  'min-h-[120px] border p-4 text-left transition',
                  on ? 'border-lime/45 bg-lime/10' : 'border-line bg-void hover:border-mute/50',
                ].join(' ')}
              >
                <item.Icon size={22} weight="bold" className={on ? 'text-lime' : 'text-mute'} />
                <h3 className="mt-3 text-sm font-bold tracking-tight text-ink">{item.t}</h3>
                <p className="mt-1 text-xs leading-snug text-mute">{item.b}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-3 border border-line bg-void px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <ch.Icon size={24} weight="bold" className="text-lime" />
            <p className="font-mono text-[10px] tracking-[0.14em] text-lime">
              {String(active + 1).padStart(2, '0')} · {ch.t.toUpperCase()}
            </p>
          </div>
          <p className="mt-3 max-w-[60ch] text-base leading-relaxed text-ink">{ch.d}</p>
        </div>
      </div>
    </section>
  );
}
