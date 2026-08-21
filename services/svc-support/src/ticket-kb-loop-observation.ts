/**
 * Ticket create + searchKb/getKb are proven in svc-support unit tests and
 * process inject suites. Live compose observation is Class X: owner sets
 * TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE=true only after observing the loop
 * in a real compose/prod process. Default unset → false (never invent SLA).
 */
export function ticketKbLoopObservedInLiveCompose(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE?.trim() === 'true';
}

/** Default refuse-closed at module load (tests pin this stays false). */
export const TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE = ticketKbLoopObservedInLiveCompose();

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
