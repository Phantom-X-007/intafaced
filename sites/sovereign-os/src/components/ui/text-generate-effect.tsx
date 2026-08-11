/**
 * Aceternity Text Generate Effect.
 * https://ui.aceternity.com/components/text-generate-effect
 * Rethemed: ink/lime, reduced-motion instant show.
 */
import { cn } from '@/lib/utils';
import { motion, stagger, useAnimate, useInView, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';

export function TextGenerateEffect({
  words,
  className,
  filter = true,
  duration = 0.45,
  wordClassName,
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
  wordClassName?: string;
}) {
  const [scope, animate] = useAnimate();
  const inView = useInView(scope, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const wordsArray = words.split(' ');

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      animate('span', { opacity: 1, filter: 'none' }, { duration: 0 });
      return;
    }
    animate(
      'span',
      {
        opacity: 1,
        filter: filter ? 'blur(0px)' : 'none',
      },
      {
        duration: duration ?? 1,
        delay: stagger(0.12),
      },
    );
  }, [inView, reduce, animate, filter, duration]);

  return (
    <div className={cn('font-extrabold', className)}>
      <motion.div ref={scope} className="leading-[1.08] tracking-tight">
        {wordsArray.map((word, idx) => (
          <motion.span
            key={word + idx}
            className={cn('text-ink opacity-0', wordClassName)}
            style={{
              filter: reduce ? 'none' : filter ? 'blur(8px)' : 'none',
            }}
          >
            {word}{' '}
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}
