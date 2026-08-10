import { cn } from '@/lib/utils';
import { useEffect, useRef, useState } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';

export function NumberTicker({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 40, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState(reduce ? value.toLocaleString() : '0');

  useEffect(() => {
    if (!isInView) return;
    if (reduce) {
      setDisplay(value.toLocaleString());
      return;
    }
    motionValue.set(value);
  }, [isInView, value, motionValue, reduce]);

  useEffect(() => {
    if (reduce) return;
    const unsub = spring.on('change', (v) => {
      setDisplay(Math.round(v).toLocaleString());
    });
    return unsub;
  }, [spring, reduce]);

  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      {display}
      {suffix}
    </span>
  );
}
