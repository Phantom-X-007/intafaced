/**
 * Aceternity Hover Border Gradient.
 * https://ui.aceternity.com/components/hover-border-gradient
 * Rethemed: lime highlight (not blue #3275F8).
 */
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { useEffect, useState, type ElementType, type ReactNode } from 'react';

type Direction = 'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT';

export function HoverBorderGradient({
  children,
  containerClassName,
  className,
  as: Tag = 'a',
  duration = 1,
  clockwise = true,
  ...props
}: {
  children: ReactNode;
  as?: ElementType;
  containerClassName?: string;
  className?: string;
  duration?: number;
  clockwise?: boolean;
} & Record<string, unknown>) {
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<Direction>('TOP');

  const rotateDirection = (currentDirection: Direction): Direction => {
    const directions: Direction[] = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'];
    const currentIndex = directions.indexOf(currentDirection);
    const nextIndex = clockwise ? (currentIndex - 1 + directions.length) % directions.length : (currentIndex + 1) % directions.length;
    return directions[nextIndex]!;
  };

  const movingMap: Record<Direction, string> = {
    TOP: 'radial-gradient(20.7% 50% at 50% 0%, rgba(196,240,0,0.55) 0%, rgba(196,240,0,0) 100%)',
    LEFT: 'radial-gradient(16.6% 43.1% at 0% 50%, rgba(196,240,0,0.45) 0%, rgba(196,240,0,0) 100%)',
    BOTTOM: 'radial-gradient(20.7% 50% at 50% 100%, rgba(196,240,0,0.55) 0%, rgba(196,240,0,0) 100%)',
    RIGHT: 'radial-gradient(16.2% 41.2% at 100% 50%, rgba(196,240,0,0.45) 0%, rgba(196,240,0,0) 100%)',
  };

  const highlight = 'radial-gradient(75% 181% at 50% 50%, rgba(196,240,0,0.65) 0%, rgba(196,240,0,0) 100%)';

  useEffect(() => {
    if (!hovered) {
      const interval = setInterval(() => {
        setDirection((prev) => rotateDirection(prev));
      }, duration * 1000);
      return () => clearInterval(interval);
    }
  }, [hovered, duration, clockwise]);

  const Comp = Tag as ElementType;

  return (
    <Comp
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex h-min w-fit flex-col flex-nowrap content-center items-center justify-center overflow-visible rounded-[3px] border border-line bg-void/40 p-px decoration-clone transition duration-500 hover:bg-void/60',
        containerClassName,
      )}
      {...props}
    >
      <div className={cn('z-10 w-auto rounded-[inherit] bg-void px-5 py-3 text-xs font-extrabold tracking-[0.06em] text-ink', className)}>
        {children}
      </div>
      <motion.div
        className="absolute inset-0 z-0 flex-none overflow-hidden rounded-[inherit]"
        style={{ filter: 'blur(2px)', width: '100%', height: '100%' }}
        initial={{ background: movingMap[direction] }}
        animate={{
          background: hovered ? [movingMap[direction], highlight] : movingMap[direction],
        }}
        transition={{ ease: 'linear', duration: duration ?? 1 }}
      />
      <div className="absolute inset-[1px] z-[1] flex-none rounded-[2px] bg-void" />
    </Comp>
  );
}
