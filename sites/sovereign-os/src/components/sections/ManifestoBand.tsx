import { BlurFade } from '@/components/magicui/blur-fade';

/** Editorial manifesto with real desk photography (not a card grid) */
export function ManifestoBand() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid lg:grid-cols-2">
        <div className="relative min-h-[280px] lg:min-h-[420px]">
          <img
            src="./media/desk.jpg"
            alt="Dark trading desk with lime edge light and market screens"
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-void/30 via-void/40 to-void lg:bg-gradient-to-r lg:from-transparent lg:via-void/50 lg:to-void" />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-void/40" />
        </div>

        <BlurFade className="relative flex flex-col justify-center px-5 py-16 sm:px-8 md:px-10 md:py-20">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lime">Manifesto</p>
          <h2 className="mt-4 max-w-[12ch] text-[clamp(2rem,4.5vw,3.25rem)] font-extrabold leading-[1.05] tracking-tight">
            The desk is the product
          </h2>
          <blockquote className="mt-8 border-l-2 border-lime pl-4 text-lg font-semibold leading-snug text-ink md:text-xl">
            Built by the streets, not by suits. Terminal up front. Depth underneath.
          </blockquote>
          <div className="mt-6 max-w-[42ch] space-y-4 text-sm leading-relaxed text-mute md:text-base">
            <p>
              Too many platforms hide trading behind banking pages and roadmap decks. We put the book, the chart, and the ticket where you
              can see them - for people who actually size trades at 3am.
            </p>
            <p>
              <strong className="text-ink">INTAFACED is an exchange with a full house behind it</strong> - spot, perps, options path, OTC
              first, then protocol, bank, payments, launch, academy on the same key.
            </p>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
