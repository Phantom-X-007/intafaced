import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'motion/react';

/** React Bits–style split line reveal (lime/void themed) */
export function SplitHeading({ lines, className, accentLine }: { lines: string[]; className?: string; accentLine?: number }) {
  const reduce = useReducedMotion();
  return (
    <h1 className={cn('font-extrabold tracking-[-0.05em] leading-[0.95]', className)}>
      {lines.map((line, i) => (
        <motion.span
          key={line + i}
          className={cn('block overflow-hidden', accentLine === i && 'text-lime')}
          initial={reduce ? false : { y: '110%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            duration: 0.7,
            delay: 0.08 * i,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          {line}
        </motion.span>
      ))}
    </h1>
  );
}
