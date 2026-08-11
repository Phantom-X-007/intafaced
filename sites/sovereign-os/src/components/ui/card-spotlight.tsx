/**
 * Aceternity Card Spotlight (simplified, no canvas-reveal dep).
 * https://ui.aceternity.com/components/card-spotlight
 * Lime radial spotlight follows pointer - brand-safe.
 */
import { cn } from '@/lib/utils';
import { motion, useMotionTemplate, useMotionValue } from 'motion/react';
import { useState, type MouseEvent, type ReactNode } from 'react';

export function CardSpotlight({
  children,
  radius = 320,
  color = 'rgba(196, 240, 0, 0.14)',
  className,
  active = true,
}: {
  children: ReactNode;
  radius?: number;
  color?: string;
  className?: string;
  active?: boolean;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const [hover, setHover] = useState(false);

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  }

  const mask = useMotionTemplate`radial-gradient(${radius}px circle at ${mouseX}px ${mouseY}px, white, transparent 75%)`;

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: hover && active ? 1 : 0,
          background: color,
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      <div className="relative z-[1] h-full">{children}</div>
    </div>
  );
}
