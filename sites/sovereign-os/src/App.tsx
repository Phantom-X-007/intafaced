import { BackgroundBeams } from '@/components/bits/background-beams';
import { ShiftCard } from '@/components/bits/shift-card';
import { SplitHeading } from '@/components/bits/split-heading';
import { SpotlightCard } from '@/components/bits/spotlight-card';
import { BentoCard, BentoGrid } from '@/components/magicui/bento-grid';
import { BlurFade } from '@/components/magicui/blur-fade';
import { BorderBeam } from '@/components/magicui/border-beam';
import { GridPattern } from '@/components/magicui/grid-pattern';
import { Marquee } from '@/components/magicui/marquee';
import { NumberTicker } from '@/components/magicui/number-ticker';
import { TradeChart } from '@/components/trade-chart';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { List, X } from '@phosphor-icons/react';
import { useState } from 'react';

const ROOMS = [
  { code: '00', name: 'Identity', role: 'One account, one rank, one wallet set', hot: false, span: '' },
  { code: '01', name: 'Trade', role: 'Spot, futures, options, OTC, copy, forex', hot: true, span: 'md:col-span-2 md:row-span-2' },
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
    t: 'Execution empire',
    b: 'Own venue fabric, smart router, algos, arb, MM, risk spine.',
    d: 'Cross-venue brain on our rails — not a borrowed stack.',
  },
  { t: 'Sovereign banking', b: 'Zero KYC by architecture on the protocol plane.', d: 'Fiat plane stays custodial and stated plainly.' },
  { t: 'P2P', b: 'Where banking rails fail, street rails win.', d: 'Escrow-protected, 100+ currencies.' },
  { t: 'Launch', b: 'Where culture mints.', d: 'Launchpad + meme factory with anti-rug posture.' },
  { t: 'Agents', b: 'A workforce, not a chatbot.', d: 'Navigator, portfolio, scanner, copy-intel — inside your limits.' },
  { t: 'Academy', b: 'Lobbies, not lectures.', d: 'Ambassadors live. Certs that cut fees.' },
  { t: 'Token', b: 'The bloodstream of the OS.', d: 'Mineable, useful, gated, yield-bearing, scarce by design.' },
  { t: 'Core', b: 'The engine room under everything.', d: 'Ledger law, recipes only, no balances outside the book.' },
] as const;

const TICKER =
  '$4,820 CARD LDN→AMS APPROVED · AED 6,207 USDC SETTLED · ESCROW LOCKED · BLOCK FINALISED · BUYBACK EXECUTED · BURN POSTED · 0 KYB · ';

export default function App() {
  const [plane, setPlane] = useState<'fiat' | 'proto'>('fiat');
  const [menu, setMenu] = useState(false);

  return (
    <div className="relative min-h-dvh bg-void text-ink">
      <GridPattern className="opacity-40" />

      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-line bg-void/85 px-4 backdrop-blur-md md:px-6">
        <a href="#top" className="font-extrabold tracking-tight">
          INTA<span className="text-lime">FACED</span>
        </a>
        <nav className="ml-4 hidden gap-4 font-mono text-[11px] uppercase tracking-[0.08em] text-mute md:flex">
          <a href="#planes" className="hover:text-lime">
            Planes
          </a>
          <a href="#rooms" className="hover:text-lime">
            Rooms
          </a>
          <a href="#trade" className="hover:text-lime">
            Trade
          </a>
          <a href="#inside" className="hover:text-lime">
            Inside
          </a>
        </nav>
        <button
          type="button"
          className="ml-auto border border-line px-2 py-1 font-mono text-[11px] text-mute md:hidden"
          onClick={() => setMenu((v) => !v)}
          aria-label="Menu"
        >
          {menu ? <X size={16} /> : <List size={16} />}
        </button>
        <a
          href="#key"
          className="ml-auto hidden bg-lime px-3 py-2 font-extrabold text-[11px] tracking-[0.06em] text-[#081008] md:inline-flex"
        >
          CUT MY KEY
        </a>
      </header>

      {menu ? (
        <div className="fixed inset-x-0 top-14 z-30 border-b border-line bg-panel p-4 font-mono text-xs uppercase tracking-wider text-mute md:hidden">
          {['planes', 'rooms', 'trade', 'inside', 'key'].map((id) => (
            <a key={id} href={`#${id}`} className="block py-2 hover:text-lime" onClick={() => setMenu(false)}>
              {id}
            </a>
          ))}
        </div>
      ) : null}

      <main id="top">
        {/* HERO */}
        <section className="relative overflow-hidden px-4 pb-10 pt-16 md:px-6 md:pt-24">
          <BackgroundBeams />
          <div className="relative mx-auto max-w-5xl">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-lime-dim">INTAFACED · SOVEREIGN OS</p>
            <SplitHeading
              className="max-w-[12ch] text-[clamp(2.4rem,7vw,4.4rem)]"
              accentLine={1}
              lines={['WEB2 RAILS IN.', 'WEB3 SETTLEMENT OUT.', 'INTELLIGENCE BINDING THEM.']}
            />
            <p className="mt-5 max-w-[36ch] text-base text-mute md:text-lg">
              Twelve rooms. Two planes. One identity, one ledger, one token — and one key that opens every door.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#key"
                className="bg-lime px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(198,255,61,0.18)]"
              >
                ENTER THE CHAIN
              </a>
              <a
                href="#rooms"
                className="border border-line px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-ink hover:border-lime-dim"
              >
                SEE ALL TWELVE ROOMS
              </a>
            </div>
            <ul className="mt-10 grid max-w-2xl grid-cols-3 gap-2 md:grid-cols-6">
              {[
                [12, 'Modules'],
                [28, 'Products'],
                [30, 'Streams'],
                [10, 'Agents'],
                [2, 'Planes'],
                [1, 'Chain'],
              ].map(([n, label]) => (
                <li key={String(label)} className="border border-line bg-panel/80 p-2.5">
                  <strong className="block font-mono text-xl text-lime">
                    <NumberTicker value={n as number} />
                  </strong>
                  <em className="text-[9px] not-italic uppercase tracking-[0.1em] text-mute">{label as string}</em>
                </li>
              ))}
            </ul>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.08em] text-mute">
              They built rooms. We built the house. Then we built the ground under it.
            </p>
          </div>
        </section>

        {/* TICKER */}
        <div className="border-y border-line bg-panel">
          <Marquee className="py-2.5 font-mono text-[11px] text-mute">
            <span className="mx-4 whitespace-nowrap">
              <span className="text-lime">{TICKER}</span>
              {TICKER}
            </span>
          </Marquee>
        </div>

        {/* MANIFESTO */}
        <BlurFade>
          <section className="mx-auto grid max-w-5xl gap-8 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Manifesto</p>
              <h2 className="mt-2 max-w-[12ch] text-3xl font-extrabold tracking-tight md:text-4xl">
                Built by the streets.
                <br />
                Not by suits.
              </h2>
            </div>
            <div className="space-y-4 text-mute">
              <p>
                Every financial platform before this one was built by suits, for suits. The people moving money at 3am got filed as a risk
                category.
              </p>
              <p>
                <strong className="text-ink">INTAFACED flips the table.</strong> Exchange. Broker. Bank. Payments. Launchpad. Predict.
                Academy. Plus our own Layer 1 path underneath.
              </p>
              <p className="border-l-2 border-lime pl-3 font-semibold text-ink">
                Nothing here looks like a bank — that is the entire point. People share what looks like them.
              </p>
            </div>
          </section>
        </BlurFade>

        {/* LAWS */}
        <BlurFade delay={0.05}>
          <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Three laws</p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                ['01', 'Everything is one login', 'Trade, borrow, spend, launch, learn, earn. One identity. One rank. Every room.'],
                ['02', 'Everything pays the user', 'Mining. Staking. Referrals. Certs that cut fees. Participation gets rewarded.'],
                ['03', 'Everything feeds the token', 'Every fee, launch, lobby, swipe, block. The community holds the upside.'],
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
          <section id="planes" className="mx-auto max-w-5xl px-4 py-14 md:px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Two planes · one economy</p>
            <h2 className="mt-2 max-w-[14ch] text-3xl font-extrabold tracking-tight md:text-4xl">We refuse the trade-off.</h2>
            <p className="mt-3 max-w-[40ch] text-sm text-mute">Switching planes changes who holds your keys. We show you which, always.</p>
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
          <section id="rooms" className="mx-auto max-w-5xl px-4 py-14 md:px-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Twelve rooms · one house · one key</p>
            <h2 className="mt-2 max-w-[12ch] text-3xl font-extrabold tracking-tight md:text-4xl">
              Separate rooms.
              <br />
              One empire.
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
          <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
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

        {/* TRADE */}
        <BlurFade>
          <section id="trade" className="mx-auto grid max-w-5xl gap-8 px-4 py-14 md:grid-cols-2 md:items-center md:px-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">Trade · the heart</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
                Pro terminal energy.
                <br />
                Not a spreadsheet.
              </h2>
              <p className="mt-4 max-w-[36ch] text-mute">
                Spot. Futures. Options. OTC. Convert. Copy. Forex. Advanced charting for people who actually trade — drawings, indicators,
                multi-layout analysis.
              </p>
              <p className="mt-3 font-mono text-[11px] text-mute">
                Demo uses Lightweight Charts (Apache-2.0). Advanced Charts licence path in progress.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-[3px] border border-line bg-[#040705] shadow-2xl">
              <BorderBeam />
              <div className="relative z-10">
                <div className="flex items-center gap-3 border-b border-line px-3 py-2 font-mono text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_#c6ff3d]" />
                  <span>BTC-PERP</span>
                  <span className="text-mute">CROSS</span>
                  <span className="text-mute">DEMO</span>
                </div>
                <TradeChart />
                <div className="flex gap-4 border-t border-line px-3 py-2 font-mono text-[11px] text-mute">
                  <span>Mark 67,412.2</span>
                  <span className="text-lime">+2.4%</span>
                  <span>Illustrative series</span>
                </div>
              </div>
            </div>
          </section>
        </BlurFade>

        {/* CHAIN PATH */}
        <BlurFade>
          <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
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
          <section className="mx-auto grid max-w-5xl gap-6 px-4 py-12 md:grid-cols-2 md:px-6">
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
          <section className="mx-auto max-w-5xl px-4 py-12 md:px-6">
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
          <section id="inside" className="mx-auto max-w-5xl px-4 py-12 md:px-6">
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
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_100%,rgba(198,255,61,0.12),transparent_60%)]" />
          <div className="relative mx-auto max-w-3xl">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-lime">The drop</p>
            <h2 className="mt-3 text-[clamp(1.6rem,4.5vw,2.8rem)] font-extrabold leading-[1.05] tracking-tight">
              THE INFRASTRUCTURE IS READY.
              <br />
              THE CULTURE IS WAITING.
              <br />
              <span className="text-lime">THE DROP IS COMING.</span>
            </h2>
            <p className="mt-4 text-mute">see you in the lobby</p>
            <a
              href="mailto:hello@intafaced.com?subject=CUT%20MY%20KEY"
              className="mt-8 inline-flex bg-lime px-6 py-3.5 text-xs font-extrabold tracking-[0.06em] text-[#081008] shadow-[0_0_32px_rgba(198,255,61,0.2)]"
            >
              CUT MY KEY
            </a>
            <p className="mt-4 font-mono text-[11px] tracking-wide text-mute">Ranked waves. Refer and move up. Rank carries forever.</p>
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

      <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-line px-4 py-8 text-sm text-mute md:px-6">
        <div>
          <a href="#top" className="font-extrabold text-ink">
            INTA<span className="text-lime">FACED</span>
          </a>
          <p className="mt-1">Twelve rooms. Two planes. One economy.</p>
        </div>
        <p className="font-mono text-[11px] tracking-wide">Separate rooms. One house. One key.</p>
        <a href="mailto:hello@intafaced.com" className="font-mono text-[11px] hover:text-lime">
          hello@intafaced.com
        </a>
      </footer>
    </div>
  );
}
