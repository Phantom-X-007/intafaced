/**
 * Ticket create + searchKb/getKb are proven in svc-support unit tests and
 * migrations. That is not the same as observing the loop serving in a live
 * compose process. Compose health is `/health` liveness. Do not treat a
 * healthy container as a served ticket+KB loop. Do not invent SLA times.
 */
export const TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE = false as const;
