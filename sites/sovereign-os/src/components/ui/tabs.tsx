import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List className={cn('inline-flex flex-wrap gap-1 rounded-[3px] border border-line bg-panel p-1', className)} {...props} />
  );
}

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'rounded-[2px] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-mute transition',
        'data-[state=active]:bg-lime data-[state=active]:text-[#081008] data-[state=active]:font-bold',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('mt-3 rounded-[3px] border border-line bg-panel p-4 text-sm text-mute outline-none', className)}
      {...props}
    />
  );
}
