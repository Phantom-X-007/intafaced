import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryCrewChannelOpener, subscribeCrewMemberCreated } from './crew-events.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('agents crewMemberCreated consumer (D-S-13 Class B close)', () => {
  it('opens crew channel on crewMemberCreated', async () => {
    const bus = new MemoryEventBus();
    const opener = new MemoryCrewChannelOpener();
    await subscribeCrewMemberCreated(bus, opener);

    await bus.publish('crewMemberCreated', {
      crewId: uuid(10),
      userId: uuid(11),
      role: 'anchor',
      crewSize: 4,
      matchRunId: uuid(12),
    });

    const ch = opener.channelOf(uuid(10), uuid(11));
    expect(ch).not.toBeNull();
    expect(ch!.role).toBe('anchor');
  });

  it('idempotent open does not duplicate', async () => {
    const bus = new MemoryEventBus();
    const opener = new MemoryCrewChannelOpener();
    await subscribeCrewMemberCreated(bus, opener);
    const payload = {
      crewId: uuid(20),
      userId: uuid(21),
      role: 'builder',
      crewSize: 2,
      matchRunId: uuid(22),
    };
    await bus.publish('crewMemberCreated', payload);
    await bus.publish('crewMemberCreated', payload);
    expect(opener.list()).toHaveLength(1);
  });
});
