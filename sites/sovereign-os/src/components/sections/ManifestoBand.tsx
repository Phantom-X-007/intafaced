/** Full-bleed editorial manifesto - not a two-column text box */
export function ManifestoBand() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_50%,rgba(196,240,0,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl xl:max-w-7xl px-4 py-20 md:px-6 md:py-28">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime">Manifesto</p>
        <h2 className="mt-4 max-w-[14ch] text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tight">
          The desk is the product
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-end">
          <blockquote className="border-l-2 border-lime pl-4 text-lg font-semibold leading-snug text-ink md:text-xl">
            Built by the streets, not by suits. Terminal up front. Depth underneath.
          </blockquote>
          <div className="space-y-4 text-sm leading-relaxed text-mute md:text-base">
            <p>
              Too many platforms hide trading behind banking pages and roadmap decks. We put the book, the chart, and the ticket where you
              can see them - for people who actually size trades at 3am.
            </p>
            <p>
              <strong className="text-ink">INTAFACED is an exchange with a full house behind it</strong> - spot, perps, options path, OTC
              first, then protocol, bank, payments, launch, academy on the same key. Layer 1 is on the map, not dressed as live.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
