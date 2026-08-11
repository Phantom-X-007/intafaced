/**
 * Aceternity Direction Aware Hover - image panel with entrance-from-side motion.
 * https://ui.aceternity.com/components/direction-aware-hover
 * Rethemed void/lime. No console.log from registry demo.
 */
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';

export function DirectionAwareHover({
  imageUrl,
  children,
  childrenClassName,
  imageClassName,
  className,
}: {
  imageUrl: string;
  children: ReactNode | string;
  childrenClassName?: string;
  imageClassName?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<'top' | 'bottom' | 'left' | 'right'>('left');

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const d = getDirection(event, ref.current);
    if (d === 0) setDirection('top');
    else if (d === 1) setDirection('right');
    else if (d === 2) setDirection('bottom');
    else setDirection('left');
  };

  const getDirection = (ev: React.MouseEvent<HTMLDivElement>, obj: HTMLElement) => {
    const { width: w, height: h, left, top } = obj.getBoundingClientRect();
    const x = ev.clientX - left - (w / 2) * (w > h ? h / w : 1);
    const y = ev.clientY - top - (h / 2) * (h > w ? w / h : 1);
    return Math.round(Math.atan2(y, x) / 1.57079633 + 5) % 4;
  };

  return (
    <motion.div
      onMouseEnter={handleMouseEnter}
      ref={ref}
      className={cn('group/card relative h-full w-full overflow-hidden bg-transparent', className)}
    >
      <AnimatePresence mode="wait">
        <motion.div className="relative h-full w-full" initial="initial" whileHover={direction} exit="exit">
          <motion.div className="absolute inset-0 z-10 hidden h-full w-full bg-void/45 transition duration-500 group-hover/card:block" />
          <motion.div variants={variants} className="relative h-full w-full bg-void" transition={{ duration: 0.2, ease: 'easeOut' }}>
            <img
              alt=""
              className={cn('h-full w-full scale-[1.12] object-cover', imageClassName)}
              width={1000}
              height={1000}
              src={imageUrl}
              draggable={false}
            />
          </motion.div>
          <motion.div
            variants={textVariants}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className={cn('absolute bottom-4 left-4 z-40 text-ink', childrenClassName)}
          >
            {children}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

const variants = {
  initial: { x: 0, y: 0 },
  exit: { x: 0, y: 0 },
  top: { y: 16 },
  bottom: { y: -16 },
  left: { x: 16 },
  right: { x: -16 },
};

const textVariants = {
  initial: { y: 0, x: 0, opacity: 0 },
  exit: { y: 0, x: 0, opacity: 0 },
  top: { y: -12, opacity: 1 },
  bottom: { y: 4, opacity: 1 },
  left: { x: -2, opacity: 1 },
  right: { x: 12, opacity: 1 },
};
