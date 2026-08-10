import { ShiftCard } from '@/components/bits/shift-card';
import { SpotlightCard } from '@/components/bits/spotlight-card';
import { ExchangeTerminal } from '@/components/exchange/ExchangeTerminal';
import { BentoCard, BentoGrid } from '@/components/magicui/bento-grid';
import { BlurFade } from '@/components/magicui/blur-fade';
import { BorderBeam } from '@/components/magicui/border-beam';
import { GridPattern } from '@/components/magicui/grid-pattern';
import { Marquee } from '@/components/magicui/marquee';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrandMark } from '@/components/BrandMark';
import { HeroSection } from '@/components/hero/HeroSection';
import { SiteLoader } from '@/components/SiteLoader';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { X } from '@phosphor-icons/react/dist/csr/X';
import { useState } from 'react';

const ROOMS = [
  { code: '00', name: 'Identity', role: 'One account, one rank, one wallet set', hot: false, span: '' },
  { code: '01', name: 'Trade', role: 'Spot · perps · options · OTC · pro charts', hot: true, span: 'md:col-span-2 md:row-span-2' },
  { code: '02', name: 'Protocol', role: 'Self-custody · zero KYC by architecture', hot: false, span: '' },
  { code: '03', name: 'P2P', role: 'Street rails · escrow · 100+ currencies', hot: false, span: '' },
  { code: '04', name: 'Launch', role: 'Launchpad · meme factory · RWA', hot: false, span: '' },
  { code: '05', name: 'Bank', role: 'Accounts, loans, yield, cards', hot: false, span: '' },
  { code: '06', name: 'Pay', role: 'Gateway · routing · merchant contracts', hot: false, span: '' },
  { code: '07', name: 'Predict', role: 'Real markets on real books', hot: false, span: '' },
  { code: '08', name: 'Market', role: 'Bots, tools, data, strategies', hot: false, span: '' },
  { code: '09', name: 'Academy', role: 'Lobbies, not lectures', hot: false, span: '' },
  { code: '10', name: 'Token + Mine', role: 'Mine, stake, govern, burn', hot: false, span: '' },
  { code: '11', name: 'Core + Agents', role: 'Engine room · AI workforce', hot: false, span: '' },
] as const;

const INSIDE = [
  {
    t: 'Matching & risk',
    b: 'Own books, margin engine, liquidation, smart router.',
    d: 'Exchange spine first — venue fabric on our rails.',
  },
  {
    t: 'Pro charting',
    b: 'Drawings, indicators, multi-layout for power traders.',
    d: 'Licensed pro chart path in progress. Demo series on site.',
  },
  { t: 'Execution empire', b: 'Algos, arb, MM, cross-venue brain.', d: 'Not a borrowed stack — our order path.' },
  { t: 'Sovereign banking', b: 'Zero KYC by architecture on the protocol plane.', d: 'Fiat plane stays custodial and stated plainly.' },
  { t: 'P2P', b: 'Where banking rails fail, street rails win.', d: 'Escrow-protected, 100+ currencies.' },
  { t: 'Agents', b: 'Scanner, portfolio, copy-intel inside your limits.', d: 'Workforce for the desk — not a chatbot toy.' },
  { t: 'Token', b: 'Fee discounts, staking, buybacks on exchange flow.', d: 'Every fill can feed the community upside.' },
  { t: 'Core', b: 'Ledger law under every trade.', d: 'Recipes only. No balances outside the book.' },
] as const;

const TICKER =
  'DEMO · BTC-PERP 67412.2 +2.4% · ETH-PERP 3412.8 +1.1% · FILL 0.42 BTC @ 67410 · FUNDING +0.012% · OI $1.2B · SOL-PERP 178.44 −0.6% · ';

export default function App() {
  const [plane, setPlane] = useState<'fiat' | 'proto'>('fiat');
  const [menu, setMenu] = useState(false);

  return (
    <SiteLoader>
      <div className="relative min-h-dvh overflow-x-hidden bg-void text-ink">
        {/* Full-bleed ambient — edges stay alive */}
        <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
          <GridPattern className="opacity-35" />
          <div className="absolute inset-y-0 left-0 w-[min(28vw,320px)] bg-gradient-to-r from-lime/[0.04] to-transparent" />
          <div className="absolute inset-y-0 right-0 w-[min(28vw,320px)] bg-gradient-to-l from-lime/[0.04] to-transparent" />
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
              Markets
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
            className="ml-auto hidden bg-lime px-3 py-2 font-extrabold text-[11px] tracking-[0.06em] text-[#081008] md:inline-flex"
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

          {/* EXCHANGE TAPE */}
          <div className="border-y border-line bg-panel">
            <Marquee className="py-2.5 font-mono text-[11px] text-mute">
              <span className="mx-4 whitespace-nowrap">
                <span className="text-lime">{TICKER}</span>
                {TICKER}
              </span>
            </Marquee>
          </div>

          {/* TERMINAL — high on page for TV reviewers */}
          <BlurFade>
            <ExchangeTerminal />
          </BlurFade>

          {/* MANIFESTO */}
          <BlurFade>
            <section className="mx-auto grid max-w-6xl xl:max-w-7xl gap-8 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Manifesto</p>
                <h2 className="mt-2 max-w-[16ch] text-3xl font-extrabold tracking-tight md:text-4xl">The desk is the product</h2>
              </div>
              <div className="space-y-4 text-mute">
                <p>
                  Too many platforms hide trading behind banking pages and roadmap decks. We put the book, the chart, and the ticket where
                  you can see them — for people who actually size trades at 3am.
                </p>
                <p>
                  <strong className="text-ink">INTAFACED is an exchange with a full house behind it</strong> — spot, perps, options path,
                  OTC first, then protocol, bank, payments, launch, academy on the same key. Layer 1 is on the map, not dressed as live.
                </p>
                <p className="border-l-2 border-lime pl-3 font-semibold text-ink">
                  Built by the streets, not by suits. Terminal up front. Depth underneath.
                </p>
              </div>
            </section>
          </BlurFade>

          {/* LAWS */}
          <BlurFade delay={0.05}>
            <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-12 md:px-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Three laws</p>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {[
                  ['01', 'Trade is one login', 'Spot, perps, options, OTC, borrow, spend. One identity. One rank. Every room.'],
                  ['02', 'Every fill can pay you', 'Fee discounts. Mining. Staking. Referrals. Participation gets rewarded.'],
                  ['03', 'Exchange flow feeds the token', 'Fees, funding, launches. The community holds the upside.'],
                ].map(([n, t, b], i) => (
                  <SpotlightCard key={n} className={i === 1 ? 'md:-translate-y-2' : ''}>
                    <span className="font-mono text-xs text-lime">{n}</span>
                    <h3 className="mt-2 text-lg font-bold tracking-tight">{t}</h3>
                    <p className="mt-2 text-sm text-mute">{b}</p>
                  </SpotlightCard>
                ))}
              </div>
            </section>
          </BlurFade>

          {/* PLANES */}
          <BlurFade>
            <section id="planes" className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-14 md:px-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Two planes · one economy</p>
              <h2 className="mt-2 max-w-[14ch] text-3xl font-extrabold tracking-tight md:text-4xl">We refuse the trade-off.</h2>
              <p className="mt-3 max-w-[40ch] text-sm text-mute">
                Switching planes changes who holds your keys. We show you which, always.
              </p>
              <div className="mt-5 inline-flex border border-line bg-panel p-1">
                {(
                  [
                    ['fiat', 'Fiat plane'],
                    ['proto', 'Protocol plane'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPlane(id)}
                    className={
                      plane === id
                        ? 'bg-lime px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-[#081008]'
                        : 'px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-mute'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <SpotlightCard className={plane === 'fiat' ? 'border-mute/40 ring-1 ring-lime/20' : 'opacity-50'}>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-mute">We hold it — so we say so</p>
                  <h3 className="mt-1 text-2xl font-extrabold">Fiat plane</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-mute">
                    <li>Custodial. Compliant. Trade, bank, cards, institutional flow.</li>
                    <li>Double-entry ledger on every movement. No exceptions.</li>
                    <li>Cold / warm / hot custody with multi-sig workflow.</li>
                  </ul>
                </SpotlightCard>
                <SpotlightCard className={plane === 'proto' ? 'border-lime-dim ring-1 ring-lime/25' : 'opacity-50'}>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-mute">You hold it — so there is nothing to ask</p>
                  <h3 className="mt-1 text-2xl font-extrabold">Protocol plane</h3>
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-mute">
                    <li>Non-custodial by architecture. Zero KYC is not a loophole.</li>
                    <li>Passkey smart accounts. Session keys you grant and revoke.</li>
                    <li>We never hold withdrawal rights — enforced by the build.</li>
                  </ul>
                </SpotlightCard>
              </div>
              <p className="mt-4 border border-line bg-[#070c09] px-4 py-3 font-mono text-[11px] tracking-wide text-lime">
                ZERO-KYC FOLLOWS CUSTODY · PROVABLY NON-CUSTODIAL OR IT DOES NOT MERGE
              </p>
            </section>
          </BlurFade>

          {/* ROOMS */}
          <BlurFade>
            <section id="rooms" className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-14 md:px-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Twelve rooms · trade leads · one key</p>
              <h2 className="mt-2 max-w-[14ch] text-3xl font-extrabold tracking-tight md:text-4xl">
                Exchange at the core.
                <br />
                Rooms around it.
              </h2>
              <BentoGrid className="mt-8">
                {ROOMS.map((r) => (
                  <BentoCard key={r.code} className={`${r.span} ${r.hot ? 'bg-gradient-to-br from-lime/10 to-transparent' : ''}`}>
                    <span className="font-mono text-[10px] tracking-wider text-lime">{r.code}</span>
                    <div>
                      <h3 className="text-base font-bold tracking-tight">{r.name}</h3>
                      <p className="mt-1 text-xs text-mute">{r.role}</p>
                    </div>
                  </BentoCard>
                ))}
              </BentoGrid>
            </section>
          </BlurFade>

          {/* SYSTEMS */}
          <BlurFade>
            <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-12 md:px-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Three shared systems</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">If a feature needs a fourth, the design is wrong.</h2>
              <Tabs defaultValue="id" className="mt-6">
                <TabsList>
                  <TabsTrigger value="id">01 · Identity</TabsTrigger>
                  <TabsTrigger value="bal">02 · Balance</TabsTrigger>
                  <TabsTrigger value="tok">03 · Token</TabsTrigger>
                </TabsList>
                <TabsContent value="id">
                  <h3 className="mb-2 font-semibold text-ink">The Identity</h3>
                  Verify once. Trade, bank, launch, learn, sell, predict — everywhere. Rank earned in any room counts in every room.
                </TabsContent>
                <TabsContent value="bal">
                  <h3 className="mb-2 font-semibold text-ink">The Balance</h3>
                  Money is never trapped in a room. Double-entry always. No module holds a balance. Recipes only.
                </TabsContent>
                <TabsContent value="tok">
                  <h3 className="mb-2 font-semibold text-ink">The Token</h3>
                  One asset across rooms and planes. Fee discounts. Rewards. Buybacks. The community holds the upside.
                </TabsContent>
              </Tabs>
            </section>
          </BlurFade>

          {/* CHAIN PATH */}
          <BlurFade>
            <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-12 md:px-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">INTACHAIN</p>
              <h2 className="mt-2 max-w-[18ch] text-2xl font-extrabold tracking-tight md:text-3xl">
                Not a tenant on somebody else&apos;s chain.
              </h2>
              <div className="mt-6 grid gap-2 md:grid-cols-4">
                {[
                  ['P0', 'Contracts on proven rails', 'near-term'],
                  ['P1', 'Our own chain', 'roadmap'],
                  ['P2', 'Performance core', 'roadmap'],
                  ['P3', 'Progressive decentralisation', 'roadmap'],
                ].map(([p, t, badge]) => (
                  <div key={p} className="border border-line bg-panel p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-lime">{p}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-mute">{badge}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink">{t}</p>
                  </div>
                ))}
              </div>
            </section>
          </BlurFade>

          {/* BLUEPRINT */}
          <BlurFade>
            <section className="mx-auto grid max-w-6xl xl:max-w-7xl gap-6 px-4 py-12 md:grid-cols-2 md:px-6">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Sovereign Blueprint</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight md:text-3xl">
                  Onboarding is not a form.
                  <br />
                  It is the first flex.
                </h2>
                <p className="mt-3 max-w-[38ch] text-sm text-mute">
                  A short conversational session. The OS bends around who you actually are. Designed to be posted — the first screenshot
                  people share.
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
          </BlurFade>

          {/* NEVER + DROP */}
          <BlurFade>
            <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-12 md:px-6">
              <div className="grid gap-10 md:grid-cols-2">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">What we will never do</p>
                  <ul className="mt-4 space-y-2 text-sm text-mute">
                    {[
                      'Never hold a balance outside the ledger.',
                      'Never store money in a floating-point number.',
                      'Never ship custodial dressed as decentralised.',
                      'Never dress a roadmap as a release.',
                      'Never trade our alpha against you.',
                      'Never sell you, your data, or your identity graph.',
                    ].map((line) => (
                      <li key={line} className="border-l border-line pl-3">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">The drop</p>
                  <h3 className="mt-2 text-xl font-extrabold">Not a fintech announcement. A game release.</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['0 Tease', 'I Blueprint', 'II Lobby', 'III Soft launch', 'IV Public', 'V Seasons'].map((p) => (
                      <span key={p} className="border border-line bg-panel px-2.5 py-1.5 font-mono text-[11px] text-mute">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </BlurFade>

          {/* INSIDE HOUSE */}
          <BlurFade>
            <section id="inside" className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-12 md:px-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Inside the house</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight">More rooms. Same key.</h2>
              <p className="mt-2 max-w-[44ch] text-sm text-mute">Depth from the full Sovereign OS pack — short cards, not a whitepaper.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {INSIDE.map((item) => (
                  <ShiftCard key={item.t} title={item.t} blurb={item.b} detail={item.d} />
                ))}
              </div>
              <Accordion type="single" collapsible className="mt-6 space-y-2">
                <AccordionItem value="more">
                  <AccordionTrigger>Why this is an OS, not a feature list</AccordionTrigger>
                  <AccordionContent>
                    Competitors can copy a room. They cannot copy the house — or the ground. One identity, one ledger, one token across both
                    planes.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>
          </BlurFade>

          {/* CLOSE */}
          <section id="key" className="relative overflow-hidden border-t border-line px-4 py-20 text-center md:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(196,240,0,0.12),transparent_60%)]" />
            <div className="relative mx-auto max-w-3xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">The drop</p>
              <h2 className="mt-3 text-[clamp(1.6rem,4.5vw,2.8rem)] font-extrabold leading-[1.05] tracking-tight">
                THE DESK IS READY.
                <br />
                THE CHARTS ARE WAITING.
                <br />
                <span className="text-lime">THE DROP IS COMING.</span>
              </h2>
              <p className="mt-4 text-mute">see you on the book</p>
              <a
                href="mailto:hello@intafaced.com?subject=OPEN%20THE%20TERMINAL"
                className="mt-8 inline-flex bg-lime px-6 py-3.5 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(196,240,0,0.2)]"
              >
                OPEN THE TERMINAL
              </a>
              <p className="mt-4 font-mono text-[11px] tracking-wide text-mute">Ranked waves. Trade access first. Rank carries forever.</p>
            </div>
          </section>

          <div className="border-t border-line bg-panel">
            <Marquee reverse className="py-2 font-mono text-[11px] text-mute">
              <span className="mx-4 whitespace-nowrap">
                ONE IDENTITY · ONE LEDGER · ONE TOKEN · TWO PLANES · TWELVE ROOMS · NEVER HALF DONE ·{' '}
              </span>
            </Marquee>
          </div>
        </main>

        <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-line px-5 py-8 text-sm text-mute sm:px-8 lg:px-12">
          <div>
            <a
              href="#top"
              className="inline-flex no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              <BrandMark compact />
            </a>
            <p className="mt-1">Twelve rooms. Two planes. One economy.</p>
            <p className="mt-2 max-w-sm font-mono text-[10px] leading-relaxed tracking-wide text-mute/80">
              Wave grid adapted from franky-adl/3d-wave-grid (MIT). Chart panel is demo data only.
            </p>
          </div>
          <p className="font-mono text-[11px] tracking-wide">Separate rooms. One house. One key.</p>
          <a href="mailto:hello@intafaced.com" className="font-mono text-[11px] hover:text-lime">
            hello@intafaced.com
          </a>
        </footer>
      </div>
    </SiteLoader>
  );
}
