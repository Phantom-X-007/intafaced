/**
 * Aceternity Encrypted Text - scramble then reveal.
 * https://ui.aceternity.com/components/encrypted-text
 */
import { cn } from '@/lib/utils';
import { useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const DEFAULT_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

function randomChar(charset: string) {
  return charset.charAt(Math.floor(Math.random() * charset.length));
}

function gibberish(original: string, charset: string) {
  let result = '';
  for (let i = 0; i < original.length; i += 1) {
    result += original[i] === ' ' ? ' ' : randomChar(charset);
  }
  return result;
}

export function EncryptedText({
  text,
  className,
  revealDelayMs = 42,
  charset = DEFAULT_CHARSET,
  flipDelayMs = 45,
  encryptedClassName,
  revealedClassName,
}: {
  text: string;
  className?: string;
  revealDelayMs?: number;
  charset?: string;
  flipDelayMs?: number;
  encryptedClassName?: string;
  revealedClassName?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(text);
  const [revealCount, setRevealCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (reduce) {
      setDisplay(text);
      setRevealCount(text.length);
      return;
    }

    const scramble = gibberish(text, charset).split('');
    let raf = 0;
    const start = performance.now();
    let lastFlip = start;

    const tick = (now: number) => {
      const revealed = Math.min(text.length, Math.floor((now - start) / revealDelayMs));
      if (now - lastFlip >= flipDelayMs) {
        for (let i = revealed; i < text.length; i += 1) {
          if (text[i] !== ' ') scramble[i] = randomChar(charset);
        }
        lastFlip = now;
      }
      const out = text
        .split('')
        .map((ch, i) => (i < revealed ? ch : (scramble[i] ?? ch)))
        .join('');
      setDisplay(out);
      setRevealCount(revealed);
      if (revealed < text.length) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isInView, text, charset, revealDelayMs, flipDelayMs, reduce]);

  return (
    <span ref={ref} className={cn('font-mono tabular-nums', className)} aria-label={text}>
      {display.split('').map((ch, i) => (
        <span key={i} className={cn(i < revealCount ? revealedClassName : encryptedClassName)} aria-hidden>
          {ch}
        </span>
      ))}
    </span>
  );
}
