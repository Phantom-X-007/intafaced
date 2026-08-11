/**
 * Aceternity Floating Dock - Mac-style magnifying nav.
 * https://ui.aceternity.com/components/floating-dock
 * Rethemed void/lime. Icons passed in (Phosphor) - no tabler dep.
 */
import { cn } from '@/lib/utils';
import { List } from '@phosphor-icons/react/dist/csr/List';
import { AnimatePresence, type MotionValue, motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';

export type DockItem = {
  title: string;
  icon: ReactNode;
  href: string;
};

export function FloatingDock({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: DockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
}

function FloatingDockMobile({ items, className }: { items: DockItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('relative block md:hidden', className)}>
      <AnimatePresence>
        {open && (
          <motion.div layoutId="nav" className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2">
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: { delay: idx * 0.05 },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.05 }}
              >
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-ink shadow-[0_8px_28px_rgba(0,0,0,0.45)]"
                >
                  <div className="h-4 w-4 text-lime">{item.icon}</div>
                </a>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? 'Close section dock' : 'Open section dock'}
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-panel/95 text-ink shadow-[0_8px_28px_rgba(0,0,0,0.5)] backdrop-blur-md"
      >
        <List size={18} className="text-lime" weight="bold" />
      </button>
    </div>
  );
}

function FloatingDockDesktop({ items, className }: { items: DockItem[]; className?: string }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'mx-auto hidden h-16 items-end gap-3 rounded-2xl border border-line/90 bg-panel/90 px-3 pb-2.5 shadow-[0_12px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl md:flex',
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  );
}

function IconContainer({ mouseX, title, icon, href }: { mouseX: MotionValue; title: string; icon: ReactNode; href: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [42, 72, 42]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [42, 72, 42]);
  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [18, 34, 18]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [18, 34, 18]);

  const width = useSpring(widthTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const height = useSpring(heightTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const widthIcon = useSpring(widthTransformIcon, { mass: 0.1, stiffness: 150, damping: 12 });
  const heightIcon = useSpring(heightTransformIcon, { mass: 0.1, stiffness: 150, damping: 12 });

  const [hovered, setHovered] = useState(false);

  return (
    <a href={href} className="outline-none focus-visible:ring-2 focus-visible:ring-lime">
      <motion.div
        ref={ref}
        style={{ width, height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative flex aspect-square items-center justify-center rounded-full border border-line bg-[#0d1410] text-lime"
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: 2, x: '-50%' }}
              className="absolute -top-9 left-1/2 w-fit whitespace-pre rounded-md border border-line bg-void px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink"
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div style={{ width: widthIcon, height: heightIcon }} className="flex items-center justify-center">
          {icon}
        </motion.div>
      </motion.div>
    </a>
  );
}
