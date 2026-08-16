/**
 * Ticket create + searchKb/getKb are proven in svc-support unit tests and
 * migrations. That is not the same as observing the loop serving in a live
 * compose process. Compose health is `/health` liveness. Do not treat a
 * healthy container as a served ticket+KB loop. Do not invent SLA times.
 *
 * Live-env Class X: this flag stays false until a human observes the loop
 * in a real compose/prod process. Process-local timestamps below are
 * observability for the mounted Fastify app — zeros until that process
 * itself succeeds create + searchKb + getKb.
 */
export const TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE = false as const;

export type TicketKbLoopSnapshot = {
  /** Unix ms of last successful ticket create on this process. 0 until first. */
  lastTicketCreateAtMs: number;
  /** Unix ms of last searchKb that returned at least one article. 0 until first. */
  lastKbSearchAtMs: number;
  /** Unix ms of last getKb that returned an article. 0 until first. */
  lastKbGetAtMs: number;
};

export type TicketKbLoopObserver = {
  markTicketCreateSuccess(): void;
  markKbSearchSuccess(): void;
  markKbGetSuccess(): void;
  snapshot(): TicketKbLoopSnapshot;
};

/** Per-process (or per-app) timestamps. Not a compose/live-env claim. */
export function createTicketKbLoopObserver(): TicketKbLoopObserver {
  let lastTicketCreateAtMs = 0;
  let lastKbSearchAtMs = 0;
  let lastKbGetAtMs = 0;
  return {
    markTicketCreateSuccess() {
      lastTicketCreateAtMs = Date.now();
    },
    markKbSearchSuccess() {
      lastKbSearchAtMs = Date.now();
    },
    markKbGetSuccess() {
      lastKbGetAtMs = Date.now();
    },
    snapshot() {
      return { lastTicketCreateAtMs, lastKbSearchAtMs, lastKbGetAtMs };
    },
  };
}
