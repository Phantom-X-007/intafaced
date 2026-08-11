import { BorderBeam } from '@/components/magicui/border-beam';
import { NumberTicker } from '@/components/magicui/number-ticker';
import { CardSpotlight } from '@/components/ui/card-spotlight';
import { EncryptedText } from '@/components/ui/encrypted-text';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { Key } from '@phosphor-icons/react/dist/csr/Key';
import { LockKey } from '@phosphor-icons/react/dist/csr/LockKey';
import { ShieldCheck } from '@phosphor-icons/react/dist/csr/ShieldCheck';
import { Vault } from '@phosphor-icons/react/dist/csr/Vault';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

type PlaneId = 'fiat' | 'proto';

const PLANES: Record<
  PlaneId,
  {
    label: string;
    hold: string;
    tag: string;
    title: string;
    image: string;
    points: string[];
    stats: { k: string; v: number; suffix?: string; note: string }[];
  }
> = {
  fiat: {
    label: 'Fiat plane',
    hold: 'WE HOLD',
    tag: 'We hold it - so we say so',
    title: 'Custodial. Compliant. Said out loud.',
    image: './media/planes/fiat.jpg',
    points: [
      'Trade, bank, cards, institutional flow on our books.',
      'Double-entry ledger on every movement. No exceptions.',
      'Cold / warm / hot custody with multi-sig workflow.',
    ],
    stats: [
      { k: 'Ledger', v: 100, suffix: '%', note: 'double-entry' },
      { k: 'Custody', v: 3, note: 'tiers cold→hot' },
      { k: 'Cosplay', v: 0, note: 'never' },
    ],
  },
  proto: {
    label: 'Protocol plane',
    hold: 'YOU HOLD',
    tag: 'You hold it - nothing to ask',
    title: 'Non-custodial by architecture.',
    image: './media/planes/protocol.jpg',
    points: [
      'Zero KYC is not a loophole - it is the build.',
      'Passkey smart accounts. Session keys you grant and revoke.',
      'We never hold withdrawal rights - enforced in code.',
    ],
    stats: [
      { k: 'Withdrawal rights', v: 0, note: 'ours' },
      { k: 'Session keys', v: 1, note: 'you grant' },
      { k: 'KYC cosplay', v: 0, note: 'refused' },
    ],
  },
};

/**
 * Two planes, one house. Dense interactive split - photos, spotlight, glow, live stats.
 * Headline stays one line so "trade-off" never orphans.
 */
export function PlanesSplit() {
  const [plane, setPlane] = useState<PlaneId>('fiat');
  const reduce = useReducedMotion();
  const active = PLANES[plane];

  return (
    <section id="planes" className="relative overflow-hidden border-y border-line bg-void">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(196,240,0,0.06),transparent_55%)]" />

      <div className="relative mx-auto max-w-6xl xl:max-w-7xl px-4 py-14 md:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl md:whitespace-nowrap">We refuse the trade-off</h2>
        <p className="mt-2 max-w-[48ch] text-sm text-mute">
          Hover a plane. Who holds the keys is never fuzzy - custody is either ours and said, or yours and enforced.
        </p>

        {/* Compare strip - fills void with live grammar */}
        <div className="mt-8 grid gap-2 sm:grid-cols-3">
          {[
            { icon: Vault, t: 'Fiat', d: 'We custody · we say so' },
            { icon: Key, t: 'Split is law', d: 'Not a marketing toggle' },
            { icon: ShieldCheck, t: 'Protocol', d: 'You custody · zero KYC path' },
          ].map((row) => (
            <div key={row.t} className="flex items-center gap-3 border border-line bg-panel/60 px-4 py-3">
              <row.icon size={20} weight="duotone" className="shrink-0 text-lime" />
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-lime">{row.t}</p>
                <p className="text-sm text-mute">{row.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dual plane arena */}
      <div className="relative grid md:grid-cols-2">
        {(
          [
            ['fiat', LockKey],
            ['proto', Key],
          ] as const
        ).map(([id, Icon]) => {
          const cfg = PLANES[id];
          const on = plane === id;
          return (
            <button
              key={id}
              type="button"
              onMouseEnter={() => setPlane(id)}
              onFocus={() => setPlane(id)}
              onClick={() => setPlane(id)}
              className={[
                'group relative min-h-[420px] overflow-hidden border-t border-line text-left transition md:min-h-[480px] md:border-t-0 md:first:border-r',
                on ? 'z-[1]' : 'z-0',
              ].join(' ')}
            >
              {/* Photo layer - distinct per plane */}
              <div className="absolute inset-0" aria-hidden>
                <img
                  src={cfg.image}
                  alt=""
                  className={[
                    'h-full w-full object-cover object-center transition duration-500',
                    on ? 'scale-105 opacity-100' : 'scale-100 opacity-45 grayscale-[30%]',
                  ].join(' ')}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <div
                  className={[
                    'absolute inset-0 transition duration-300',
                    on ? 'bg-gradient-to-t from-void via-void/75 to-void/35' : 'bg-gradient-to-t from-void via-void/90 to-void/70',
                  ].join(' ')}
                />
              </div>

              {on ? (
                <>
                  <GlowingEffect spread={40} glow proximity={64} inactiveZone={0.2} borderWidth={1.5} />
                  <BorderBeam duration={10} />
                </>
              ) : null}

              <CardSpotlight
                active={on}
                className="relative z-[1] flex h-full min-h-[420px] flex-col justify-between p-6 md:min-h-[480px] md:p-8"
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                      <Icon size={14} weight="bold" className={on ? 'text-lime' : 'text-mute'} />
                      {cfg.label}
                    </span>
                    <span className={['font-mono text-[9px] uppercase tracking-wider', on ? 'text-lime' : 'text-mute/70'].join(' ')}>
                      {on ? 'ACTIVE' : 'HOVER'}
                    </span>
                  </div>

                  <p
                    className={[
                      'mt-8 text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl',
                      on ? 'text-lime' : 'text-ink/70',
                    ].join(' ')}
                  >
                    {cfg.hold}
                  </p>
                  <p className="mt-2 max-w-[28ch] text-sm text-mute md:text-base">{cfg.tag}</p>
                </div>

                <div>
                  <AnimatePresence mode="wait">
                    {on ? (
                      <motion.div
                        key={id}
                        initial={reduce ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? undefined : { opacity: 0 }}
                        transition={{ duration: 0.22 }}
                      >
                        <p className="mb-4 max-w-[36ch] text-sm font-medium text-ink/90">{cfg.title}</p>
                        <ul className="max-w-[40ch] space-y-2.5">
                          {cfg.points.map((p, i) => (
                            <motion.li
                              key={p}
                              initial={reduce ? false : { opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05, duration: 0.2 }}
                              className="border-l-2 border-lime/50 pl-3 text-sm leading-relaxed text-mute"
                            >
                              {p}
                            </motion.li>
                          ))}
                        </ul>
                      </motion.div>
                    ) : (
                      <p className="font-mono text-[11px] tracking-wider text-mute/60">Hover to open this plane</p>
                    )}
                  </AnimatePresence>
                </div>
              </CardSpotlight>
            </button>
          );
        })}
      </div>

      {/* Active plane metrics - kills empty whitespace under the split */}
      <div className="border-t border-line bg-panel/80">
        <div className="mx-auto grid max-w-6xl gap-0 xl:max-w-7xl md:grid-cols-3">
          {active.stats.map((s) => (
            <div key={s.k} className="border-b border-line px-5 py-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-mute">{s.k}</p>
              <p className="mt-1 flex items-baseline gap-1 text-3xl font-extrabold tracking-tight text-lime">
                <NumberTicker value={s.v} />
                {s.suffix ? <span className="text-xl">{s.suffix}</span> : null}
              </p>
              <p className="mt-1 text-xs text-mute">{s.note}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line bg-[#070c09] px-4 py-4 text-center">
        <EncryptedText
          text="ZERO-KYC FOLLOWS CUSTODY · PROVABLY NON-CUSTODIAL OR IT DOES NOT MERGE"
          className="font-mono text-[11px] tracking-wide text-lime"
          encryptedClassName="text-mute/40"
          revealedClassName="text-lime"
          revealDelayMs={28}
        />
      </div>
    </section>
  );
}
