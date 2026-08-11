const LINES = [
  'Never hold a balance outside the ledger',
  'Never store money in a floating-point number',
  'Never ship custodial dressed as decentralised',
  'Never dress a roadmap as a release',
  'Never trade our alpha against you',
  'Never sell you, your data, or your identity graph',
] as const;

/** Strike-through on hover - doctrine without dead bullets */
export function NeverList() {
  return (
    <section className="mx-auto max-w-6xl xl:max-w-7xl px-4 py-16 md:px-6">
      <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">What we will never do</h2>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {LINES.map((line) => (
          <li key={line}>
            <button type="button" className="group flex w-full items-center gap-4 py-4 text-left transition hover:bg-panel/50">
              <span className="font-mono text-[10px] text-danger opacity-60 group-hover:opacity-100">✕</span>
              <span className="text-sm text-mute transition group-hover:text-ink group-hover:line-through group-hover:decoration-danger/60">
                {line}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
