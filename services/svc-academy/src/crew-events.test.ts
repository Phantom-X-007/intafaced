import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { MemoryCrewLobbyRouter, subscribeCrewMemberCreated } from './crew-events.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('academy crewMemberCreated consumer (D-S-13 Class B close)', () => {
  it('routes placement on crewMemberCreated', async () => {
    const bus = new MemoryEventBus();
    const router = new MemoryCrewLobbyRouter();
    await subscribeCrewMemberCreated(bus, router);

    await bus.publish('crewMemberCreated', {
      crewId: uuid(1),
      userId: uuid(2),
      role: 'scout',
      crewSize: 3,
      matchRunId: uuid(3),
    });

    const p = router.placementOf(uuid(2));
    expect(p).not.toBeNull();
    expect(p!.crewId).toBe(uuid(1));
    expect(p!.crewSize).toBe(3);
  });
});
