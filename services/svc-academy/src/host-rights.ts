import { BASE_PERKS, rankPerksSchema, serviceAuthHeaders, type RankPerks } from '@intafaced/contracts';
import { AcademyError } from './errors.js';

/**
 * WHO MAY OPEN A LOBBY (§4.1, §XIII).
 *
 * The spec does not leave this to a scope. `rank_thresholds.perks` is named in
 * §4.1 as "the machine-readable perk table other services query", and the field
 * it carries for this service is `lobbyHostRights` — seeded false at ranks 0–3
 * and true from rank 4 up (services/svc-identity/src/rank/thresholds.ts).
 * Hosting is therefore something a user EARNS, and svc-identity is the only
 * place that fact lives.
 *
 * ── Why this is not `academy:write` ─────────────────────────────────────────
 *
 * `academy:write` is issued to every session (packages/auth/src/scopes.ts), and
 * it has to be: taking a seat is a write, and a lobby nobody may sit in is not
 * a lobby. So the scope answers "may this caller act in the Academy at all",
 * which is a different question from "may this caller create a room, invite
 * into it, and put a session on a stage". Gating hosting on the scope would
 * have handed room creation to every account on the platform the moment the
 * scope was issued — and the §XIII product model is ambassadors and operators
 * running rooms, not anyone with a login.
 *
 * Reading it here rather than trusting a claim in the token is the same reason
 * svc-trade reads perks at order placement: rank moves, and a perk baked into a
 * token outlives the rank that earned it.
 *
 * ── FAILS CLOSED ────────────────────────────────────────────────────────────
 *
 * If the perk table cannot be read, hosting is refused. The alternative is
 * opening room creation to the whole platform for the length of an svc-identity
 * outage, which is exactly the window in which nobody is watching. Nothing has
 * been created at this point, so refusing costs a retry and admitting costs a
 * cleanup.
 *
 * Note what this does NOT gate: joining. `join` never asks this question, so
 * svc-identity being down closes no lobby that is already open. Strictness is
 * confined to the one path where being wrong creates something.
 */
export interface HostRightsSource {
  perksOf(userId: string): Promise<RankPerks>;
}

/**
 * Rank 0 for everyone — `lobbyHostRights: false`, so nobody hosts.
 *
 * Tests and a dev stack running without svc-identity. It refuses rather than
 * admits, which is what makes it safe to reach for: the failure mode of picking
 * this by accident is "I cannot create a room", not "everyone can".
 */
export class BaseHostRights implements HostRightsSource {
  async perksOf(): Promise<RankPerks> {
    return BASE_PERKS;
  }
}

/** HTTP client for svc-identity's `/internal/rank/:userId/perks` (S2S, no user principal). */
export function createHostRightsSource(baseUrl: string, internalSecret: string): HostRightsSource {
  const url = baseUrl.replace(/\/$/, '');

  return {
    async perksOf(userId: string): Promise<RankPerks> {
      let response: Response;
      try {
        response = await fetch(`${url}/internal/rank/${encodeURIComponent(userId)}/perks`, {
          method: 'GET',
          headers: { 'content-type': 'application/json', ...serviceAuthHeaders('svc-academy', internalSecret) },
        });
      } catch (err) {
        throw new AcademyError(`Host rights unavailable: ${(err as Error).message}`, 'academy.host_rights_unavailable');
      }

      if (!response.ok) {
        throw new AcademyError(`Host rights unavailable (${response.status})`, 'academy.host_rights_unavailable');
      }

      const body = await response.json().catch(() => null);
      const parsed = rankPerksSchema.safeParse(body);
      if (!parsed.success) {
        // A perk table we cannot parse is a perk table we must not guess at.
        throw new AcademyError('Host rights payload did not match the published contract', 'academy.host_rights_unavailable');
      }

      return parsed.data;
    },
  };
}

/**
 * The decision, separated from the fetch so it is one line everything reads.
 *
 * Pure, for the same reason `decideSeat` is: the router's "can I host" badge and
 * the mutation that actually creates the room must not be able to disagree.
 */
export function mayHost(perks: RankPerks): boolean {
  return perks.lobbyHostRights === true;
}
