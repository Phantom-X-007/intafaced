import { cn } from '@/lib/utils';

/** Aceternity-inspired background beams — rethemed lime, low intensity */
export function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div className="absolute -top-1/3 right-[-10%] h-[70%] w-[55%] rounded-full bg-[radial-gradient(circle,rgba(196,240,0,0.16),transparent_65%)] blur-2xl animate-pulse-slow" />
      <div className="absolute bottom-[-20%] left-[-10%] h-[50%] w-[40%] rounded-full bg-[radial-gradient(circle,rgba(122,176,31,0.1),transparent_70%)] blur-3xl" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.18]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="beam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c4f000" stopOpacity="0" />
            <stop offset="50%" stopColor="#c4f000" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#c4f000" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[12, 28, 44, 60, 76].map((x, i) => (
          <line
            key={x}
            x1={`${x}%`}
            y1="0%"
            x2={`${x + 18}%`}
            y2="100%"
            stroke="url(#beam)"
            strokeWidth="1"
            className="animate-beam-drift"
            style={{ animationDelay: `${i * 0.6}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
