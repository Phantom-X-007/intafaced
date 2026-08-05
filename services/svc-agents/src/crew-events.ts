/**
 * EVENT WIRING — crewMemberCreated → agents crew channel open (ADR D-S-13).
 *
 * Catalog: "svc-agents opens the crew channel". Stage-1 records the channel
 * open intent with durable subscribe; model routing residual stays separate.
 */

import { MemorySeenStore, idempotent, type EventBus, type SeenStore, type Subscription } from '@intafaced/events';

export type CrewChannel = {
  readonly crewId: string;
  readonly userId: string;
  readonly role: string;
  readonly openedAt: Date;
};

export class MemoryCrewChannelOpener {
  private readonly channels = new Map<string, CrewChannel>();

  open(input: { crewId: string; userId: string; role: string; now?: Date }): CrewChannel {
    const key = `${input.crewId}:${input.userId}`;
    const existing = this.channels.get(key);
    if (existing) return existing;
    const row: CrewChannel = {
      crewId: input.crewId,
      userId: input.userId,
      role: input.role,
      openedAt: input.now ?? new Date(),
    };
    this.channels.set(key, row);
    return row;
  }

  channelOf(crewId: string, userId: string): CrewChannel | null {
    return this.channels.get(`${crewId}:${userId}`) ?? null;
  }

  list(): CrewChannel[] {
    return [...this.channels.values()];
  }
}

export async function subscribeCrewMemberCreated(
  bus: EventBus,
  opener: MemoryCrewChannelOpener,
  store: SeenStore = new MemorySeenStore(),
): Promise<Subscription> {
  return bus.subscribe(
    'crewMemberCreated',
    idempotent(
      async (payload) => {
        opener.open({
          crewId: payload.crewId,
          userId: payload.userId,
          role: payload.role,
        });
      },
      store,
      'svc-agents-crew-channel',
    ),
    { durable: 'agents-crew-member-created' },
  );
}
