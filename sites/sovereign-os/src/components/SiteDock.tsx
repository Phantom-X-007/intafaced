/**
 * Section-jump floating dock - Aceternity FloatingDock themed for INTAFACED.
 */
import { FloatingDock } from '@/components/ui/floating-dock';
import { ChartLine } from '@phosphor-icons/react/dist/csr/ChartLine';
import { IdentificationCard } from '@phosphor-icons/react/dist/csr/IdentificationCard';
import { Key } from '@phosphor-icons/react/dist/csr/Key';
import { SquaresFour } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { Stack } from '@phosphor-icons/react/dist/csr/Stack';
import { RocketLaunch } from '@phosphor-icons/react/dist/csr/RocketLaunch';

const ITEMS = [
  {
    title: 'Trade',
    href: '#trade',
    icon: <ChartLine size="100%" weight="duotone" className="h-full w-full" />,
  },
  {
    title: 'Seats',
    href: '#blueprint',
    icon: <IdentificationCard size="100%" weight="duotone" className="h-full w-full" />,
  },
  {
    title: 'Rooms',
    href: '#rooms',
    icon: <SquaresFour size="100%" weight="duotone" className="h-full w-full" />,
  },
  {
    title: 'Planes',
    href: '#planes',
    icon: <Stack size="100%" weight="duotone" className="h-full w-full" />,
  },
  {
    title: 'Drop',
    href: '#drop',
    icon: <RocketLaunch size="100%" weight="duotone" className="h-full w-full" />,
  },
  {
    title: 'Key',
    href: '#key',
    icon: <Key size="100%" weight="duotone" className="h-full w-full" />,
  },
];

export function SiteDock() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-end px-4 md:bottom-6 md:justify-center">
      <div className="pointer-events-auto">
        <FloatingDock items={ITEMS} desktopClassName="border-lime/15" />
      </div>
    </div>
  );
}
