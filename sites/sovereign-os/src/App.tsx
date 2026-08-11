import { ExchangeTerminal } from '@/components/exchange/ExchangeTerminal';
import { BorderBeam } from '@/components/magicui/border-beam';
import { GridPattern } from '@/components/magicui/grid-pattern';
import { Marquee } from '@/components/magicui/marquee';
import { BrandMark } from '@/components/BrandMark';
import { HeroSection } from '@/components/hero/HeroSection';
import { ChainTimeline } from '@/components/sections/ChainTimeline';
import { DropPhases } from '@/components/sections/DropPhases';
import { InsideScroll } from '@/components/sections/InsideScroll';
import { LawsRail } from '@/components/sections/LawsRail';
import { ManifestoBand } from '@/components/sections/ManifestoBand';
import { NeverList } from '@/components/sections/NeverList';
import { PlanesSplit } from '@/components/sections/PlanesSplit';
import { RoomsFloor } from '@/components/sections/RoomsFloor';
import { SystemsPanel } from '@/components/sections/SystemsPanel';
import { SiteLoader } from '@/components/SiteLoader';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { useState } from 'react';

const TICKER =
  'DEMO · BTC-PERP 67412.2 +2.4% · ETH-PERP 3412.8 +1.1% · FILL 0.42 BTC @ 67410 · FUNDING +0.012% · OI $1.2B · SOL-PERP 178.44 −0.6% · ';

/**
 * Section layout families (no two adjacent share the same pattern):
 * Hero editorial · Tape marquee · Terminal cockpit · Manifesto band · Laws rail ·
 * Planes split · Rooms floor scroll · Systems hover panel · Chain timeline ·
 * Blueprint card · Drop phases · Never strike list · Inside scroll · Close
 */
export default function App() {
  const [menu, setMenu] = useState(false);

  return (
    <SiteLoader>
      <div className="relative min-h-dvh overflow-x-hidden bg-void text-ink">
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
          <GridPattern className="opacity-30" />
          <div className="absolute inset-y-0 left-0 w-[min(22vw,260px)] bg-gradient-to-r from-lime/[0.03] to-transparent" />
          <div className="absolute inset-y-0 right-0 w-[min(22vw,260px)] bg-gradient-to-l from-lime/[0.03] to-transparent" />
        </div>

        <header className="sticky top-0 z-40 flex h-14 w-full items-center gap-4 border-b border-line bg-void/85 px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <a href="#top" className="inline-flex items-center no-underline">
            <BrandMark compact />
          </a>
          <nav className="ml-4 hidden gap-4 font-mono text-[11px] uppercase tracking-[0.08em] text-mute md:flex">
            <a href="#trade" className="hover:text-lime">
              Trade
            </a>
            <a href="#rooms" className="hover:text-lime">
              Rooms
            </a>
            <a href="#planes" className="hover:text-lime">
              Planes
            </a>
            <a href="#inside" className="hover:text-lime">
              Inside
            </a>
          </nav>
          <button
            type="button"
            className="ml-auto border border-line px-2 py-1 font-mono text-[11px] text-mute focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime md:hidden"
            onClick={() => setMenu((v) => !v)}
            aria-label="Menu"
            aria-expanded={menu}
          >
            {menu ? <X size={16} /> : <List size={16} />}
          </button>
          <a
            href="#trade"
            className="ml-auto hidden bg-lime px-3 py-2 font-extrabold text-[11px] tracking-[0.06em] text-[#081008] md:inline-flex active:scale-[0.98]"
          >
            OPEN TERMINAL
          </a>
        </header>

        {menu ? (
          <div className="fixed inset-x-0 top-14 z-30 border-b border-line bg-panel p-4 font-mono text-xs uppercase tracking-wider text-mute md:hidden">
            {['trade', 'rooms', 'planes', 'inside', 'key'].map((id) => (
              <a key={id} href={`#${id}`} className="block py-2 hover:text-lime" onClick={() => setMenu(false)}>
                {id}
              </a>
            ))}
          </div>
        ) : null}

        <main id="top" className="relative z-[1] w-full">
          <HeroSection />

          <div className="border-y border-line bg-panel">
            <Marquee className="py-2.5 font-mono text-[11px] text-mute">
              <span className="mx-4 whitespace-nowrap">
                <span className="text-lime">{TICKER}</span>
                {TICKER}
              </span>
            </Marquee>
          </div>

          <ExchangeTerminal />

          <ManifestoBand />
          <LawsRail />
          <PlanesSplit />
          <RoomsFloor />
          <SystemsPanel />
          <ChainTimeline />

          {/* Blueprint - framed identity card (different family) */}
          <section className="mx-auto grid max-w-6xl xl:max-w-7xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center md:px-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                Onboarding is not a form.
                <br />
                It is the first flex.
              </h2>
              <p className="mt-3 max-w-[38ch] text-sm text-mute">
                A short conversational session. The OS bends around who you actually are - built to be the first screenshot people share.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-[3px] border border-line bg-panel p-5">
              <BorderBeam duration={10} />
              <div className="relative z-10">
                <div className="flex justify-between font-mono text-[10px] tracking-wider text-mute">
                  <span>SOVEREIGN BLUEPRINT</span>
                  <span className="text-lime">RANK · FOUNDING</span>
                </div>
                <p className="mt-4 text-2xl font-extrabold tracking-tight">YOUR IDENTITY CARD</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    ['DECISION', 'Aggressive clarity'],
                    ['RISK', 'Controlled fire'],
                    ['ENERGY', 'Night session'],
                    ['CREW', 'Caller / scout'],
                  ].map(([k, v]) => (
                    <div key={k} className="border border-line bg-panel-2 p-2.5">
                      <span className="block font-mono text-[10px] text-lime">{k}</span>
                      <span className="text-sm">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <DropPhases />
          <NeverList />
          <InsideScroll />

          <section id="key" className="relative overflow-hidden border-t border-line px-4 py-24 text-center md:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(196,240,0,0.14),transparent_60%)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-[clamp(1.7rem,4.5vw,2.9rem)] font-extrabold leading-[1.05] tracking-tight">
                THE DESK IS READY
                <br />
                THE CHARTS ARE WAITING
                <br />
                <span className="text-lime">THE DROP IS COMING</span>
              </h2>
              <p className="mt-4 text-mute">see you on the book</p>
              <a
                href="mailto:hello@intafaced.com?subject=OPEN%20THE%20TERMINAL"
                className="mt-8 inline-flex bg-lime px-6 py-3.5 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(196,240,0,0.2)] active:scale-[0.98]"
              >
                OPEN THE TERMINAL
              </a>
              <p className="mt-4 font-mono text-[11px] tracking-wide text-mute">Ranked waves. Trade access first. Rank carries forever.</p>
            </div>
          </section>
        </main>

        <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-line px-5 py-8 text-sm text-mute sm:px-8 lg:px-12">
          <div>
            <a
              href="#top"
              className="inline-flex no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              <BrandMark compact />
            </a>
            <p className="mt-1">Exchange first. House under it.</p>
            <p className="mt-2 max-w-sm font-mono text-[10px] leading-relaxed tracking-wide text-mute/80">
              Wave grid adapted from franky-adl/3d-wave-grid (MIT). Charts and tape are demo data only.
            </p>
          </div>
          <p className="font-mono text-[11px] tracking-wide">One desk. Twelve rooms. One key.</p>
          <a href="mailto:hello@intafaced.com" className="font-mono text-[11px] hover:text-lime">
            hello@intafaced.com
          </a>
        </footer>
      </div>
    </SiteLoader>
  );
}
