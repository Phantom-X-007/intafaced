/**
 * EVENT WIRING — crewMemberCreated → academy lobby route (ADR D-S-13 Class B close).
 *
 * Catalog: "svc-academy routes the lobby". Stage-1 places the durable
 * subscription + in-memory placement record so the bus has a real consumer.
 * Full lobby seat assignment residual (room capacity / host) stays product path.
 */

import { MemorySeenStore, idempotent, type EventBus, type SeenStore, type Subscription } from '@intafaced/events';

export type CrewPlacement = {
  readonly crewId: string;
  readonly userId: string;
  readonly role: string;
  readonly crewSize: number;
  readonly matchRunId: string;
  readonly routedAt: Date;
};

/** Process-local placement log for tests + readiness. */
export class MemoryCrewLobbyRouter {
  private readonly byUser = new Map<string, CrewPlacement>();

  route(input: Omit<CrewPlacement, 'routedAt'> & { now?: Date }): CrewPlacement {
    const row: CrewPlacement = {
      crewId: input.crewId,
      userId: input.userId,
      role: input.role,
      crewSize: input.crewSize,
      matchRunId: input.matchRunId,
      routedAt: input.now ?? new Date(),
    };
    this.byUser.set(input.userId, row);
    return row;
  }

  placementOf(userId: string): CrewPlacement | null {
    return this.byUser.get(userId) ?? null;
  }

  list(): CrewPlacement[] {
    return [...this.byUser.values()];
  }
}

export async function subscribeCrewMemberCreated(
  bus: EventBus,
  router: MemoryCrewLobbyRouter,
  store: SeenStore = new MemorySeenStore(),
): Promise<Subscription> {
  return bus.subscribe(
    'crewMemberCreated',
    idempotent(
      async (payload) => {
        router.route({
          crewId: payload.crewId,
          userId: payload.userId,
          role: payload.role,
          crewSize: payload.crewSize,
          matchRunId: payload.matchRunId,
        });
      },
      store,
      'svc-academy-crew-lobby',
    ),
    { durable: 'academy-crew-member-created' },
  );
}
