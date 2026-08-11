const ITEMS = [
  {
    t: 'Matching & risk',
    b: 'Own books, margin engine, liquidation, smart router.',
    d: 'Exchange spine first - venue fabric on our rails.',
  },
  {
    t: 'Pro charting',
    b: 'Drawings, indicators, multi-layout for power traders.',
    d: 'Licensed pro chart path in progress. Demo series on site.',
  },
  { t: 'Execution empire', b: 'Algos, arb, MM, cross-venue brain.', d: 'Not a borrowed stack - our order path.' },
  { t: 'Sovereign banking', b: 'Zero KYC by architecture on the protocol plane.', d: 'Fiat plane stays custodial and stated plainly.' },
  { t: 'P2P', b: 'Where banking rails fail, street rails win.', d: 'Escrow-protected, 100+ currencies.' },
  { t: 'Agents', b: 'Scanner, portfolio, copy-intel inside your limits.', d: 'Workforce for the desk - not a chatbot toy.' },
  { t: 'Token', b: 'Fee discounts, staking, buybacks on exchange flow.', d: 'Every fill can feed the community upside.' },
  { t: 'Core', b: 'Ledger law under every trade.', d: 'Recipes only. No balances outside the book.' },
] as const;

/** Horizontal story cards with flip-on-hover detail */
export function InsideScroll() {
  return (
    <section id="inside" className="py-16">
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-4 md:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Inside the house</h2>
        <p className="mt-2 max-w-[44ch] text-sm text-mute">Scroll sideways. Hover to flip the card. Depth without a whitepaper dump.</p>
      </div>
      <div className="mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:px-6">
        {ITEMS.map((item) => (
          <article
            key={item.t}
            className="group relative h-[200px] w-[min(280px,80vw)] shrink-0 snap-start border border-line bg-panel p-4 transition hover:border-lime-dim"
          >
            <div className="absolute inset-0 flex flex-col justify-between p-4 transition group-hover:opacity-0">
              <h3 className="text-base font-bold tracking-tight text-ink">{item.t}</h3>
              <p className="text-sm text-mute">{item.b}</p>
            </div>
            <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-br from-lime/10 to-panel p-4 opacity-0 transition group-hover:opacity-100">
              <p className="text-sm leading-relaxed text-ink">{item.d}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
