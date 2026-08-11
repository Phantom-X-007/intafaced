/**
 * Aceternity Moving Border button.
 * https://ui.aceternity.com/components/moving-border
 * Rethemed: lime traveler on void shell.
 */
import { cn } from '@/lib/utils';
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useRef, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react';

type MovingBorderButtonProps<T extends ElementType> = {
  borderRadius?: string;
  children: ReactNode;
  as?: T;
  containerClassName?: string;
  borderClassName?: string;
  duration?: number;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

export function MovingBorderButton<T extends ElementType = 'a'>({
  borderRadius = '4px',
  children,
  as,
  containerClassName,
  borderClassName,
  duration = 2800,
  className,
  ...otherProps
}: MovingBorderButtonProps<T>) {
  const Component = (as ?? 'a') as ElementType;
  const reduce = useReducedMotion();

  return (
    <Component
      className={cn(
        'relative inline-flex h-11 overflow-hidden bg-transparent p-[1px] text-xs font-extrabold tracking-[0.06em]',
        containerClassName,
      )}
      style={{ borderRadius }}
      {...otherProps}
    >
      <div className="absolute inset-0" style={{ borderRadius: `calc(${borderRadius} * 0.96)` }}>
        {!reduce ? (
          <MovingBorder duration={duration} rx="12%" ry="12%">
            <div className={cn('h-16 w-16 bg-[radial-gradient(#c4f000_40%,transparent_60%)] opacity-90', borderClassName)} />
          </MovingBorder>
        ) : (
          <div className="absolute inset-0 rounded-[inherit] border border-lime/40" />
        )}
      </div>

      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center border border-lime/30 bg-lime text-[#081008] antialiased',
          className,
        )}
        style={{ borderRadius: `calc(${borderRadius} * 0.96)` }}
      >
        {children}
      </div>
    </Component>
  );
}

export function MovingBorder({
  children,
  duration = 3000,
  rx,
  ry,
  ...otherProps
}: {
  children: ReactNode;
  duration?: number;
  rx?: string;
  ry?: string;
} & React.SVGProps<SVGSVGElement>) {
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val).y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute h-full w-full"
        width="100%"
        height="100%"
        {...otherProps}
      >
        <rect fill="none" width="100%" height="100%" rx={rx} ry={ry} ref={pathRef} />
      </svg>
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'inline-block',
          transform,
        }}
      >
        {children}
      </motion.div>
    </>
  );
}
