/**
 * Aceternity Meteors.
 * https://ui.aceternity.com/components/meteors
 * Rethemed lime streaks. Deterministic positions (no Math.random in render).
 */
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'motion/react';

export function Meteors({ number = 12, className }: { number?: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  const meteors = Array.from({ length: number }, (_, idx) => {
    const position = idx * (900 / number) - 450;
    const delay = ((idx * 0.37) % 4).toFixed(2);
    const duration = 5 + (idx % 5);
    return { position, delay, duration, idx };
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      {meteors.map((m) => (
        <span
          key={`meteor-${m.idx}`}
          className={cn(
            'animate-meteor-effect absolute h-0.5 w-0.5 rotate-[45deg] rounded-full bg-lime',
            'shadow-[0_0_0_1px_rgba(196,240,0,0.12)]',
            "before:absolute before:top-1/2 before:h-px before:w-[48px] before:-translate-y-1/2 before:bg-gradient-to-r before:from-lime before:to-transparent before:content-['']",
            className,
          )}
          style={{
            top: '-40px',
            left: `${m.position}px`,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          }}
        />
      ))}
    </motion.div>
  );
}
