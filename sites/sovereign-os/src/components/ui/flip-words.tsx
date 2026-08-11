/**
 * Aceternity Flip Words.
 * https://ui.aceternity.com/components/flip-words
 * Rethemed for void/lime exchange hero.
 */
import { cn } from '@/lib/utils';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';

export function FlipWords({ words, duration = 2800, className }: { words: string[]; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [currentWord, setCurrentWord] = useState(words[0] ?? '');
  const [isAnimating, setIsAnimating] = useState(false);

  const startAnimation = useCallback(() => {
    const i = words.indexOf(currentWord);
    const word = words[i + 1] ?? words[0] ?? '';
    setCurrentWord(word);
    setIsAnimating(true);
  }, [currentWord, words]);

  useEffect(() => {
    if (reduce) return;
    if (!isAnimating) {
      const t = window.setTimeout(() => startAnimation(), duration);
      return () => window.clearTimeout(t);
    }
  }, [isAnimating, duration, startAnimation, reduce]);

  if (reduce) {
    return <span className={cn('inline text-lime', className)}>{words[0]}</span>;
  }

  return (
    <AnimatePresence
      onExitComplete={() => {
        setIsAnimating(false);
      }}
    >
      <motion.span
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        exit={{
          opacity: 0,
          y: -24,
          filter: 'blur(6px)',
          position: 'absolute',
        }}
        className={cn('relative z-10 inline-block text-left text-lime', className)}
        key={currentWord}
      >
        {currentWord.split('').map((letter, letterIndex) => (
          <motion.span
            key={currentWord + letterIndex}
            initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: letterIndex * 0.04, duration: 0.18 }}
            className="inline-block"
          >
            {letter === ' ' ? '\u00a0' : letter}
          </motion.span>
        ))}
      </motion.span>
    </AnimatePresence>
  );
}
