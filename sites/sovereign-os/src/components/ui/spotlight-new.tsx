/**
 * Aceternity Spotlight New - dual sweeping light cones.
 * https://ui.aceternity.com/components/spotlight-new
 * Rethemed: soft lime haze (not blue demo).
 */
import { motion, useReducedMotion } from 'motion/react';

type SpotlightProps = {
  gradientFirst?: string;
  gradientSecond?: string;
  gradientThird?: string;
  translateY?: number;
  width?: number;
  height?: number;
  smallWidth?: number;
  duration?: number;
  xOffset?: number;
};

const LIME_FIRST =
  'radial-gradient(68.54% 68.72% at 55.02% 31.46%, hsla(72, 100%, 47%, .11) 0, hsla(72, 80%, 35%, .04) 50%, hsla(72, 70%, 25%, 0) 80%)';
const LIME_SECOND = 'radial-gradient(50% 50% at 50% 50%, hsla(72, 100%, 47%, .08) 0, hsla(72, 80%, 35%, .03) 80%, transparent 100%)';
const LIME_THIRD = 'radial-gradient(50% 50% at 50% 50%, hsla(72, 100%, 47%, .05) 0, hsla(72, 70%, 30%, .02) 80%, transparent 100%)';

export function Spotlight({
  gradientFirst = LIME_FIRST,
  gradientSecond = LIME_SECOND,
  gradientThird = LIME_THIRD,
  translateY = -350,
  width = 560,
  height = 1380,
  smallWidth = 240,
  duration = 7,
  xOffset = 100,
}: SpotlightProps = {}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      aria-hidden
    >
      <motion.div
        animate={reduce ? undefined : { x: [0, xOffset, 0] }}
        transition={reduce ? undefined : { duration, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        className="pointer-events-none absolute left-0 top-0 z-0 h-full w-full"
      >
        <div
          style={{
            transform: `translateY(${translateY}px) rotate(-45deg)`,
            background: gradientFirst,
            width: `${width}px`,
            height: `${height}px`,
          }}
          className="absolute left-0 top-0"
        />
        <div
          style={{
            transform: 'rotate(-45deg) translate(5%, -50%)',
            background: gradientSecond,
            width: `${smallWidth}px`,
            height: `${height}px`,
          }}
          className="absolute left-0 top-0 origin-top-left"
        />
        <div
          style={{
            transform: 'rotate(-45deg) translate(-180%, -70%)',
            background: gradientThird,
            width: `${smallWidth}px`,
            height: `${height}px`,
          }}
          className="absolute left-0 top-0 origin-top-left"
        />
      </motion.div>

      <motion.div
        animate={reduce ? undefined : { x: [0, -xOffset, 0] }}
        transition={reduce ? undefined : { duration, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
        className="pointer-events-none absolute right-0 top-0 z-0 h-full w-full"
      >
        <div
          style={{
            transform: `translateY(${translateY}px) rotate(45deg)`,
            background: gradientFirst,
            width: `${width}px`,
            height: `${height}px`,
          }}
          className="absolute right-0 top-0"
        />
        <div
          style={{
            transform: 'rotate(45deg) translate(-5%, -50%)',
            background: gradientSecond,
            width: `${smallWidth}px`,
            height: `${height}px`,
          }}
          className="absolute right-0 top-0 origin-top-right"
        />
        <div
          style={{
            transform: 'rotate(45deg) translate(180%, -70%)',
            background: gradientThird,
            width: `${smallWidth}px`,
            height: `${height}px`,
          }}
          className="absolute right-0 top-0 origin-top-right"
        />
      </motion.div>
    </motion.div>
  );
}
