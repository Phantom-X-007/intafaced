const STEPS = [
  { p: 'P0', t: 'Contracts on proven rails', badge: 'near-term', d: 'Ship on rails that already settle.' },
  { p: 'P1', t: 'Our own chain', badge: 'roadmap', d: 'INTACHAIN as the settlement ground.' },
  { p: 'P2', t: 'Performance core', badge: 'roadmap', d: 'Throughput for the full house.' },
  { p: 'P3', t: 'Progressive decentralisation', badge: 'roadmap', d: 'Hardening without the cosplay.' },
] as const;

/** Vertical path with live pulse on first step - not 4 equal boxes */
export function ChainTimeline() {
  return (
    <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-16 md:px-6">
      <h2 className="max-w-[18ch] text-2xl font-extrabold tracking-tight md:text-3xl">Not a tenant on somebody else&apos;s chain</h2>
      <ol className="relative mt-10 space-y-0 border-l border-line pl-6 md:pl-8">
        {STEPS.map((step, i) => (
          <li key={step.p} className="relative pb-10 last:pb-0">
            <span
              className={[
                'absolute -left-[1.6rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border md:-left-[2.1rem]',
                i === 0 ? 'border-lime bg-lime shadow-[0_0_12px_rgba(196,240,0,0.5)]' : 'border-line bg-panel',
              ].join(' ')}
              aria-hidden
            />
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-xs text-lime">{step.p}</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-mute">{step.badge}</span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-ink">{step.t}</h3>
            <p className="mt-1 max-w-[40ch] text-sm text-mute">{step.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
