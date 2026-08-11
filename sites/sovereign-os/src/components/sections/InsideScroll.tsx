import { useEffect, useRef, useState } from 'react';

const CHAPTERS = [
  {
    id: 'match',
    t: 'Matching & risk',
    b: 'Own books, margin engine, liquidation, smart router.',
    d: 'Exchange spine first - venue fabric on our rails, not a borrowed stack with a skin.',
  },
  {
    id: 'charts',
    t: 'Pro charting',
    b: 'Drawings, indicators, multi-layout for power traders.',
    d: 'Licensed pro chart path in progress. What you see on this site is a demo series only.',
  },
  {
    id: 'exec',
    t: 'Execution empire',
    b: 'Algos, arb, MM, cross-venue brain.',
    d: 'Order path we own. Not a middleman API dressed as product.',
  },
  {
    id: 'bank',
    t: 'Sovereign banking',
    b: 'Zero KYC by architecture on the protocol plane.',
    d: 'Fiat plane stays custodial and said out loud. No cosplay.',
  },
  {
    id: 'p2p',
    t: 'P2P',
    b: 'Where banking rails fail, street rails win.',
    d: 'Escrow-protected. 100+ currencies. Street liquidity.',
  },
  {
    id: 'agents',
    t: 'Agents',
    b: 'Scanner, portfolio, copy-intel inside your limits.',
    d: 'Workforce for the desk - not a chatbot toy bolted on.',
  },
  {
    id: 'token',
    t: 'Token',
    b: 'Fee discounts, staking, buybacks on exchange flow.',
    d: 'Every fill can feed community upside. Token is bloodstream, not a sticker.',
  },
  {
    id: 'core',
    t: 'Core',
    b: 'Ledger law under every trade.',
    d: 'Recipes only. No balances outside the book. Ever.',
  },
] as const;

/**
 * Kernel document - sticky index + continuous chapters.
 * Not a horizontal card rail (that family is banned next to Rooms).
 */
export function InsideScroll() {
  const [active, setActive] = useState<string>(CHAPTERS[0]!.id);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const els = CHAPTERS.map((c) => refs.current[c.id]).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id.replace('ch-', ''));
      },
      { rootMargin: '-30% 0px -50% 0px', threshold: [0.2, 0.5, 0.8] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => {
    setActive(id);
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="inside" className="border-t border-line py-20">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Inside the house</h2>
        <p className="mt-2 max-w-[42ch] text-sm text-mute">
          Read it like a kernel log - not a pile of cards. Scroll the chapters. The index tracks where you are.
        </p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[11rem_1fr] lg:gap-14">
          {/* Index - plain text, sticky */}
          <nav className="lg:sticky lg:top-20 lg:self-start" aria-label="Inside chapters">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-mute">Index</p>
            <ul className="flex flex-row flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-1">
              {CHAPTERS.map((ch, i) => {
                const on = active === ch.id;
                return (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => jump(ch.id)}
                      className={['font-mono text-[11px] tracking-wide transition', on ? 'text-lime' : 'text-mute hover:text-ink'].join(
                        ' ',
                      )}
                    >
                      <span className="mr-2 opacity-50">{String(i + 1).padStart(2, '0')}</span>
                      {ch.t}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Document body */}
          <div className="min-w-0 border-l border-line pl-0 lg:pl-10">
            {CHAPTERS.map((ch, i) => (
              <article
                key={ch.id}
                id={`ch-${ch.id}`}
                ref={(el) => {
                  refs.current[ch.id] = el;
                }}
                className="scroll-mt-24 border-b border-line py-10 last:border-b-0 first:pt-0"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[11px] text-lime/70">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="text-xl font-bold tracking-tight text-ink md:text-2xl">{ch.t}</h3>
                </div>
                <p className="mt-3 max-w-[48ch] text-[15px] font-medium leading-relaxed text-ink/90">{ch.b}</p>
                <p className="mt-3 max-w-[50ch] text-sm leading-relaxed text-mute">{ch.d}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
