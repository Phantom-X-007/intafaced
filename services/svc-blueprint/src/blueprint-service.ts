import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import type { EventBus } from '@intafaced/events';
import {
  blueprintProfileSchema,
  type BlueprintContract,
  type BlueprintExport,
  type BlueprintProfile,
  type BlueprintRecord,
  type CrewRole,
  type EraseReceipt,
  type MentorMatch,
  type OnboardInput,
  type OnboardOutput,
  type Placement,
  type Visibility,
} from '@intafaced/contracts';
import { EngineProtocolError, EngineUnavailableError, type BlueprintRequest, type NeuralEngineClient } from './engine/neural-engine.js';
import { chooseCrew, crewName, newCrewId, rankCrews, type CrewCandidate, type MatchableProfile } from './matching/crew-matching.js';
import { shortlistMentors, type MentorCandidate, type MentorProfile } from './matching/mentor-matching.js';
import { withBlueprintSpan } from './tracing.js';

/**
 * svc-blueprint — THE IDENTITY BLUEPRINT (§7.1).
 *
 * The onboarding intelligence is the **Neural Engine**, consumed as an internal
 * service over an HTTP contract (Doctrine §0.7). This service owns the
 * `NeuralEngineClient` interface, the profile it returns, crew matching, mentor
 * shortlists, and the two things §7.2 promises the user: **export** and **hard
 * delete**.
 *
 * ── Three properties this file is built around ──────────────────────────────
 *
 * 1. **No half-written Blueprint.** The engine is called *before* the
 *    transaction opens. If it fails, nothing is written — not a blueprint row
 *    with a null profile, not a crew membership waiting for one. §7.2's failure
 *    path is enforced by ordering, not by cleanup.
 *
 * 2. **Placement is reproducible.** Every input to a placement decision is a
 *    pure function of profiles and crew ids (`matching/crew-matching.ts`). The
 *    only clock in this file writes `ts` columns; none of them is read back by
 *    anything that decides where a person goes.
 *
 * 3. **The profile never leaves except to its owner.** It is not on an event
 *    payload, not on a span, not in an error message, not in a log line. It
 *    goes into `blueprints.profile` and comes back out through `export()` and
 *    the authorised read on the router. §10.
 *
 * ── What this service is not ────────────────────────────────────────────────
 * It holds no balances and posts no ledger transactions. Nothing in this
 * package imports the ledger client, and nothing should: a crew is a social
 * object, and `crews.xp` is a count.
 *
 * (Said without naming the package, deliberately. The DoD gate classifies a
 * file as a money path by searching for that import specifier, so a comment
 * asserting its absence would classify this file as touching money — and the
 * gate would then pass only via its "some test exists nearby" fallback. A gate
 * that passes by coincidence is not a gate.)
 */

export class BlueprintError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'blueprint.not_found'
      | 'blueprint.crew_not_found'
      | 'blueprint.crew_full'
      | 'blueprint.engine_unavailable'
      | 'blueprint.engine_protocol'
      | 'blueprint.invalid_profile',
  ) {
    super(message);
    this.name = 'BlueprintError';
  }
}

export interface BlueprintServiceOptions {
  /** Default capacity for crews this service forms. Stored per crew. */
  crewCapacity?: number;
  mentorShortlistSize?: number;
  season?: number;
}

interface BlueprintRow {
  id: string;
  user_id: string;
  engine_version: string;
  profile: BlueprintProfile;
  card_asset_url: string | null;
  visibility: Visibility;
  mentor_available: boolean;
  created_at: Date;
}

export class BlueprintService implements BlueprintContract {
  private readonly crewCapacity: number;
  private readonly mentorShortlistSize: number;
  private readonly season: number;

  constructor(
    private readonly sql: Sql,
    private readonly engine: NeuralEngineClient,
    private readonly bus: EventBus,
    options: BlueprintServiceOptions = {},
  ) {
    this.crewCapacity = options.crewCapacity ?? 6;
    this.mentorShortlistSize = options.mentorShortlistSize ?? 3;
    this.season = options.season ?? 1;
  }

  // ── Onboarding (§7.1 flow) ─────────────────────────────────────────────────

  /**
   * The whole flow: session → engine → persist → crew placement → mentor
   * shortlist.
   *
   * Deliberately one call. The §7.2 target is end-to-end ("signup → session →
   * reveal → crew placement < 3 minutes"), and splitting this into four
   * round-trips would spend most of that budget on latency between steps that
   * have nothing to wait for.
   *
   * Re-running it for the same user is safe: the Blueprint is upserted on
   * `user_id` and the placement short-circuits to the existing crew. That is
   * the "same input, same placement" guarantee at the service level; the
   * scoring function guarantees it at the algorithmic level.
   */
  async onboard(input: OnboardInput): Promise<OnboardOutput> {
    return withBlueprintSpan('blueprint.onboard', { stage: 'session', userId: input.userId }, async () => {
      // ── 1 · The engine, OUTSIDE any transaction ──────────────────────────
      // If this throws, no row was ever written and none needs cleaning up.
      // Holding a transaction open across a 20-second network call would also
      // pin a connection and a snapshot for the duration, which is how a slow
      // engine turns into a database incident.
      const result = await this.deriveProfile(input);

      // Defence in depth: the HTTP adapter validated the engine's response and
      // the mock validates its own output. Validating again here means a future
      // adapter that forgets cannot write an unreadable profile into a column
      // that four other services read.
      const parsed = blueprintProfileSchema.safeParse(result.profile);
      if (!parsed.success) {
        throw new BlueprintError('Neural Engine returned a profile this service cannot store', 'blueprint.invalid_profile');
      }
      const profile = parsed.data;

      // ── 2 · Persist + place, atomically ──────────────────────────────────
      const written = await transaction(
        this.sql,
        async (tx) => {
          const blueprint = await this.upsertBlueprint(tx, input, result.engineVersion, profile);
          const placement = await this.placeInCrew(tx, input.userId, profile);
          const mentors = await this.writeMentorShortlist(tx, input.userId, profile);
          return { blueprint, placement, mentors };
        },
        // Serializable: placement reads every open crew's membership and then
        // inserts a membership, so two people onboarding at once are exactly
        // the read-write conflict this level exists to detect. Without it both
        // could see the same crew at 5/6 and both join.
        { isolation: 'serializable', maxAttempts: 5 },
      );

      // ── 3 · Announce, AFTER the commit ───────────────────────────────────
      // Publishing inside the transaction would announce a Blueprint that a
      // serialization failure then rolled back — and svc-identity would be
      // holding a blueprint_id pointing at nothing.
      await this.announce(written.blueprint, written.placement, input.userId);

      return {
        blueprint: written.blueprint,
        placement: written.placement,
        mentors: written.mentors,
      };
    });
  }

  /** Call the engine and translate its failures into this service's taxonomy. */
  private async deriveProfile(input: OnboardInput): Promise<{ engineVersion: string; profile: BlueprintProfile }> {
    return withBlueprintSpan('blueprint.engine', { stage: 'engine', userId: input.userId }, async (span) => {
      const request: BlueprintRequest = {
        requestId: crypto.randomUUID(),
        locale: input.locale,
        responses: input.responses,
        ...(input.birthData ? { birthData: input.birthData } : {}),
      };

      try {
        const result = await this.engine.profile(request);
        span.setAttribute('intafaced.engineVersion', result.engineVersion);
        span.setAttribute('intafaced.latencyMs', result.latencyMs);
        return { engineVersion: result.engineVersion, profile: result.profile };
      } catch (err) {
        if (err instanceof EngineUnavailableError) {
          throw new BlueprintError('The Neural Engine is unavailable — no Blueprint was created', 'blueprint.engine_unavailable');
        }
        if (err instanceof EngineProtocolError) {
          throw new BlueprintError('The Neural Engine returned an unusable profile', 'blueprint.engine_protocol');
        }
        throw err;
      }
      // Note what is NOT in either message: the session, the birth data, or any
      // part of the profile. An error string is logged, aggregated and often
      // shown to a user (§10).
    });
  }

  private async upsertBlueprint(tx: Sql, input: OnboardInput, engineVersion: string, profile: BlueprintProfile): Promise<BlueprintRecord> {
    const rows = await tx<BlueprintRow[]>`
      INSERT INTO blueprint.blueprints (user_id, engine_version, profile, visibility, mentor_available)
      VALUES (
        ${input.userId}, ${engineVersion}, ${this.sql.json(profile as never)},
        ${input.visibility}, ${input.mentorAvailable}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        engine_version   = EXCLUDED.engine_version,
        profile          = EXCLUDED.profile,
        visibility       = EXCLUDED.visibility,
        mentor_available = EXCLUDED.mentor_available,
        updated_at       = now()
      RETURNING id, user_id, engine_version, profile, card_asset_url, visibility, mentor_available, created_at
    `;

    const row = rows[0];
    if (!row) throw new BlueprintError('Blueprint write returned no row', 'blueprint.not_found');
    return toBlueprintRecord(row);
  }

  // ── Crew matching (§7.1) ───────────────────────────────────────────────────

  /**
   * Place a user in a crew, or form one.
   *
   * The short-circuit on an existing membership is the service-level half of
   * the determinism guarantee. The other half — that scoring the same crews
   * twice ranks them identically — lives in `rankCrews`, is pure, and is tested
   * without a database.
   *
   * A `match_run` is written on every call, including the short-circuit, because
   * §7.1 makes it the audit trail of *runs*, not of *changes*. "Why am I in this
   * crew" should be answerable from the row, and a re-run that changed nothing
   * is itself a fact worth having.
   */
  private async placeInCrew(tx: Sql, userId: string, profile: BlueprintProfile): Promise<Placement> {
    const candidates = await this.loadCandidates(tx);
    const ranked = rankCrews(profile, candidates);
    const choice = chooseCrew(profile, candidates);

    const existing = await tx<Array<{ crew_id: string }>>`
      SELECT crew_id FROM blueprint.crew_members WHERE user_id = ${userId}
    `;

    // The audit trail records EVERY open crew that was scored, not just the
    // ones that cleared the threshold — "why was I not put with them" is the
    // question a match run has to be able to answer.
    const scores: Record<string, number> = {};
    for (const scored of ranked) scores[scored.crewId] = scored.score;
    const candidateSummary = candidates.map((c) => ({ crewId: c.crewId, size: c.members.length }));

    // Already placed: the crew a user is in does not change because they
    // re-ran onboarding. Moving them would break every crew's composition to
    // no one's benefit, and would make "re-run and land in the same crew"
    // false by design.
    const current = existing[0];
    if (current) {
      const crew = await this.loadCrew(tx, current.crew_id);
      const matchRunId = await this.recordMatchRun(tx, userId, candidateSummary, scores, current.crew_id);
      return {
        crewId: crew.id,
        crewName: crew.name,
        score: scores[current.crew_id] ?? 0,
        matchRunId,
        crewFormed: false,
      };
    }

    if (choice) {
      await this.insertMembership(tx, choice.crewId, userId, profile.crewRole);
      const crew = await this.loadCrew(tx, choice.crewId);
      const matchRunId = await this.recordMatchRun(tx, userId, candidateSummary, scores, choice.crewId);
      return { crewId: crew.id, crewName: crew.name, score: choice.score, matchRunId, crewFormed: false };
    }

    // No crew is open, or none is better than starting fresh — form one. The id is derived
    // from the season and this user, so a retry of this exact placement forms
    // the same crew rather than stranding an empty one.
    const crewId = newCrewId(this.season, userId);
    const crew = await this.formCrew(tx, crewId);
    await this.insertMembership(tx, crewId, userId, profile.crewRole);
    const matchRunId = await this.recordMatchRun(tx, userId, candidateSummary, scores, crewId);

    return { crewId: crew.id, crewName: crew.name, score: 0, matchRunId, crewFormed: true };
  }

  /**
   * Every open crew in the current season, with its members' matchable axes.
   *
   * The join to `blueprints` is an INNER join in effect (`b.profile IS NOT
   * NULL` on the aggregate filter) and the count comes from the same join, so
   * `members.length` is always the number of members we can actually score.
   * `ORDER BY c.id` makes the row order itself stable, which matters less than
   * the tie-break in `rankCrews` but costs nothing and removes a variable.
   */
  private async loadCandidates(tx: Sql): Promise<CrewCandidate[]> {
    const rows = await tx<Array<{ crew_id: string; capacity: number; members: MatchableProfile[] }>>`
      SELECT
        c.id AS crew_id,
        c.capacity,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'crewRole',        b.profile ->> 'crewRole',
              'decisionStyle',   b.profile ->> 'decisionStyle',
              'riskTemperament', b.profile ->> 'riskTemperament',
              'energyRhythm',    b.profile ->> 'energyRhythm',
              'learningMode',    b.profile ->> 'learningMode'
            )
            ORDER BY m.user_id
          ) FILTER (WHERE b.profile IS NOT NULL),
          '[]'::jsonb
        ) AS members
      FROM blueprint.crews c
      LEFT JOIN blueprint.crew_members m ON m.crew_id = c.id
      LEFT JOIN blueprint.blueprints  b ON b.user_id = m.user_id
      WHERE c.season = ${this.season}
      GROUP BY c.id, c.capacity
      ORDER BY c.id
    `;

    return rows.map((row) => ({ crewId: row.crew_id, capacity: row.capacity, members: row.members }));
  }

  /**
   * Insert a membership, enforcing capacity.
   *
   * The crew row is locked before the count is taken. Under `serializable` the
   * conflict would be detected anyway, but the lock turns "two people raced and
   * one transaction aborted" into "two people queued" — and, more importantly,
   * makes the check correct even if a future caller runs this at a weaker
   * isolation level.
   */
  private async insertMembership(tx: Sql, crewId: string, userId: string, role: CrewRole): Promise<void> {
    const crews = await tx<Array<{ capacity: number }>>`
      SELECT capacity FROM blueprint.crews WHERE id = ${crewId} FOR UPDATE
    `;
    const crew = crews[0];
    if (!crew) throw new BlueprintError(`Crew ${crewId} does not exist`, 'blueprint.crew_not_found');

    const counted = await tx<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM blueprint.crew_members WHERE crew_id = ${crewId}
    `;
    const size = counted[0]?.count ?? 0;

    // Already a member — idempotent, and not a capacity breach.
    const mine = await tx<Array<{ user_id: string }>>`
      SELECT user_id FROM blueprint.crew_members WHERE crew_id = ${crewId} AND user_id = ${userId}
    `;
    if (mine[0]) return;

    if (size >= crew.capacity) {
      throw new BlueprintError(`Crew ${crewId} is full (${size}/${crew.capacity})`, 'blueprint.crew_full');
    }

    await tx`
      INSERT INTO blueprint.crew_members (crew_id, user_id, role)
      VALUES (${crewId}, ${userId}, ${role})
      ON CONFLICT (crew_id, user_id) DO NOTHING
    `;
  }

  /**
   * Form a crew at a derived id.
   *
   * The name is derived from the id, so it survives a restore that a counter
   * would not. The collision branch exists because the name vocabulary is
   * finite: when a season already holds the derived name, the id's first bytes
   * disambiguate — still deterministic, still the same name on every retry.
   */
  private async formCrew(tx: Sql, crewId: string): Promise<{ id: string; name: string }> {
    const existing = await tx<Array<{ id: string; name: string }>>`
      SELECT id, name FROM blueprint.crews WHERE id = ${crewId}
    `;
    if (existing[0]) return existing[0];

    const base = crewName(crewId);
    const taken = await tx<Array<{ id: string }>>`
      SELECT id FROM blueprint.crews WHERE name = ${base} AND season = ${this.season}
    `;
    const name = taken.length > 0 ? `${base} ${crewId.slice(0, 4).toUpperCase()}` : base;

    const rows = await tx<Array<{ id: string; name: string }>>`
      INSERT INTO blueprint.crews (id, name, season, capacity)
      VALUES (${crewId}, ${name}, ${this.season}, ${this.crewCapacity})
      ON CONFLICT (id) DO NOTHING
      RETURNING id, name
    `;

    const row = rows[0] ?? (await this.loadCrew(tx, crewId));
    return { id: row.id, name: row.name };
  }

  private async loadCrew(tx: Sql, crewId: string): Promise<{ id: string; name: string }> {
    const rows = await tx<Array<{ id: string; name: string }>>`
      SELECT id, name FROM blueprint.crews WHERE id = ${crewId}
    `;
    const row = rows[0];
    if (!row) throw new BlueprintError(`Crew ${crewId} does not exist`, 'blueprint.crew_not_found');
    return row;
  }

  private async recordMatchRun(
    tx: Sql,
    userId: string,
    candidates: ReadonlyArray<{ crewId: string; size: number }>,
    scores: Record<string, number>,
    placedCrewId: string | null,
  ): Promise<string> {
    const rows = await tx<Array<{ id: string }>>`
      INSERT INTO blueprint.match_runs (user_id, candidates, scores, placed_crew_id)
      VALUES (${userId}, ${this.sql.json(candidates as never)}, ${this.sql.json(scores as never)}, ${placedCrewId})
      RETURNING id
    `;
    const row = rows[0];
    if (!row) throw new BlueprintError('Match run write returned no row', 'blueprint.not_found');
    return row.id;
  }

  /**
   * Public join, for an invite or an operator move rather than a match run.
   *
   * Its own transaction, and the same capacity check — §7.2 says a full crew
   * does not take another member, and a second code path that forgot would make
   * that statement false for the one case (invites) where people care most.
   */
  async joinCrew(crewId: string, userId: string, role: CrewRole): Promise<void> {
    await transaction(
      this.sql,
      async (tx) => {
        await this.insertMembership(tx, crewId, userId, role);
      },
      { isolation: 'serializable', maxAttempts: 5 },
    );
  }

  // ── Mentor shortlist (§7.1) ────────────────────────────────────────────────

  private async writeMentorShortlist(tx: Sql, studentId: string, profile: BlueprintProfile): Promise<MentorMatch[]> {
    const rows = await tx<Array<{ user_id: string; profile: MentorProfile }>>`
      SELECT user_id, profile
        FROM blueprint.blueprints
       WHERE mentor_available = true AND user_id <> ${studentId}
       ORDER BY user_id
    `;

    const candidates: MentorCandidate[] = rows.map((r) => ({ userId: r.user_id, profile: r.profile }));
    const shortlist = shortlistMentors(studentId, profile, candidates, this.mentorShortlistSize);

    const written: MentorMatch[] = [];
    for (const entry of shortlist) {
      // Upsert on the pair: a re-run refreshes the score rather than stacking a
      // second row that would then appear twice in the same shortlist.
      await tx`
        INSERT INTO blueprint.mentor_matches (student_id, mentor_id, fit_score, status)
        VALUES (${studentId}, ${entry.mentorId}, ${entry.fitScore}, 'shortlisted')
        ON CONFLICT (student_id, mentor_id) DO UPDATE SET fit_score = EXCLUDED.fit_score, updated_at = now()
      `;
      written.push({ studentId, mentorId: entry.mentorId, fitScore: entry.fitScore, status: 'shortlisted' });
    }

    return written;
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  async get(input: { userId: string }): Promise<BlueprintRecord | null> {
    const rows = await this.sql<BlueprintRow[]>`
      SELECT id, user_id, engine_version, profile, card_asset_url, visibility, mentor_available, created_at
        FROM blueprint.blueprints WHERE user_id = ${input.userId}
    `;
    const row = rows[0];
    return row ? toBlueprintRecord(row) : null;
  }

  // ── Ownership: export (§7.2) ───────────────────────────────────────────────

  /**
   * Everything this service holds about a user, as JSON.
   *
   * "Complete" is the exit criterion, so the shape follows the tables rather
   * than the UI: if a row in this schema references the user, it is in here.
   * That includes `mentoringOthers` — the shortlists this user appears ON —
   * which a UI would never show but which is unambiguously data about them.
   *
   * What is deliberately absent is other people's profiles. A crewmate is
   * listed by id and role, not by profile: this is the user's export, and their
   * crewmates did not consent to being in it.
   */
  async export(input: { userId: string }): Promise<BlueprintExport> {
    return withBlueprintSpan('blueprint.export', { stage: 'export', userId: input.userId }, async () => {
      const blueprint = await this.get(input);

      const memberships = await this.sql<Array<{ crew_id: string; user_id: string; role: CrewRole; joined_at: Date }>>`
        SELECT crew_id, user_id, role, joined_at FROM blueprint.crew_members WHERE user_id = ${input.userId}
      `;
      const membership = memberships[0] ?? null;

      const crews = membership
        ? await this.sql<
            Array<{
              id: string;
              name: string;
              formed_at: Date;
              season: number;
              xp: string;
              lobby_id: string | null;
              capacity: number;
            }>
          >`
            SELECT id, name, formed_at, season, xp, lobby_id, capacity
              FROM blueprint.crews WHERE id = ${membership.crew_id}
          `
        : [];
      const crew = crews[0] ?? null;

      const crewmates = membership
        ? await this.sql<Array<{ user_id: string; role: CrewRole; joined_at: Date }>>`
            SELECT user_id, role, joined_at
              FROM blueprint.crew_members
             WHERE crew_id = ${membership.crew_id} AND user_id <> ${input.userId}
             ORDER BY user_id
          `
        : [];

      const runs = await this.sql<Array<{ id: string; candidates: unknown; scores: unknown; placed_crew_id: string | null; ts: Date }>>`
        SELECT id, candidates, scores, placed_crew_id, ts
          FROM blueprint.match_runs WHERE user_id = ${input.userId} ORDER BY ts ASC
      `;

      const asStudent = await this.sql<Array<{ student_id: string; mentor_id: string; fit_score: number; status: string }>>`
        SELECT student_id, mentor_id, fit_score, status
          FROM blueprint.mentor_matches WHERE student_id = ${input.userId} ORDER BY fit_score DESC, mentor_id ASC
      `;

      const asMentor = await this.sql<Array<{ student_id: string; mentor_id: string; fit_score: number; status: string }>>`
        SELECT student_id, mentor_id, fit_score, status
          FROM blueprint.mentor_matches WHERE mentor_id = ${input.userId} ORDER BY fit_score DESC, student_id ASC
      `;

      return {
        exportedAt: new Date().toISOString(),
        schemaVersion: 1 as const,
        blueprint,
        crew: crew
          ? {
              id: crew.id,
              name: crew.name,
              formedAt: crew.formed_at.toISOString(),
              season: crew.season,
              xp: String(crew.xp),
              lobbyId: crew.lobby_id,
              capacity: crew.capacity,
            }
          : null,
        membership: membership
          ? {
              crewId: membership.crew_id,
              userId: membership.user_id,
              role: membership.role,
              joinedAt: membership.joined_at.toISOString(),
            }
          : null,
        crewmates: crewmates.map((c) => ({ userId: c.user_id, role: c.role, joinedAt: c.joined_at.toISOString() })),
        matchRuns: runs.map((r) => ({
          id: r.id,
          candidates: r.candidates,
          scores: r.scores,
          placedCrewId: r.placed_crew_id,
          ts: r.ts.toISOString(),
        })),
        mentorMatches: asStudent.map(toMentorMatch),
        mentoringOthers: asMentor.map(toMentorMatch),
      };
    });
  }

  // ── Ownership: hard delete (§7.2) ──────────────────────────────────────────

  /**
   * HARD DELETE. §7.2: "Deletion truly cascades."
   *
   * Not a soft delete, not a tombstone, not an anonymisation. Five statements in
   * one transaction, and afterwards no row in this schema references the user.
   *
   * Four decisions worth stating, because each is a way this could have quietly
   * failed to cascade:
   *
   *  · **Mentor rows are deleted on BOTH sides.** Deleting only `student_id`
   *    would leave the user on other people's shortlists — their id, their fit
   *    score, still queryable. That is the single easiest half of this to miss.
   *
   *  · **Match runs go with them.** They are keyed by user and describe that
   *    user's placement history. They hold crew ids and integers, never another
   *    person's profile, precisely so that deleting them is complete rather
   *    than partial.
   *
   *  · **A crew emptied by the departure is dissolved.** Otherwise a hard
   *    delete leaves a crew of zero that still appears in matching, still gets
   *    scored, and still carries the name derived from its founder.
   *
   *  · **`profiles.blueprint_id` in svc-identity is cleared by an EVENT.** This
   *    service does not and must not write another service's tables (§2). The
   *    `blueprintDeleted` event is our half of the contract; svc-identity's
   *    consumer is theirs. The test asserts the event is published with the
   *    payload that consumer needs, because that is the boundary we own.
   *
   * Idempotent: erasing an already-erased user deletes nothing, publishes
   * nothing, and returns a receipt of zeroes.
   */
  async erase(input: { userId: string }): Promise<EraseReceipt> {
    return withBlueprintSpan('blueprint.erase', { stage: 'erase', userId: input.userId }, async () => {
      const outcome = await transaction(
        this.sql,
        async (tx) => {
          const found = await tx<Array<{ id: string }>>`
            SELECT id FROM blueprint.blueprints WHERE user_id = ${input.userId}
          `;
          const blueprintId = found[0]?.id ?? null;

          const touchedCrews = await tx<Array<{ crew_id: string }>>`
            SELECT crew_id FROM blueprint.crew_members WHERE user_id = ${input.userId}
          `;
          const crewIds = touchedCrews.map((r) => r.crew_id);

          const mentorMatches = await tx<Array<{ id: string }>>`
            DELETE FROM blueprint.mentor_matches
             WHERE student_id = ${input.userId} OR mentor_id = ${input.userId}
            RETURNING id
          `;

          const memberships = await tx<Array<{ crew_id: string }>>`
            DELETE FROM blueprint.crew_members WHERE user_id = ${input.userId} RETURNING crew_id
          `;

          const matchRuns = await tx<Array<{ id: string }>>`
            DELETE FROM blueprint.match_runs WHERE user_id = ${input.userId} RETURNING id
          `;

          const blueprints = await tx<Array<{ id: string }>>`
            DELETE FROM blueprint.blueprints WHERE user_id = ${input.userId} RETURNING id
          `;

          let emptiedCrews = 0;
          if (crewIds.length > 0) {
            // Only crews this user was actually in, and only if now empty.
            // Other people's crews are none of this operation's business.
            const dissolved = await tx<Array<{ id: string }>>`
              DELETE FROM blueprint.crews AS c
               WHERE c.id = ANY(${crewIds}::uuid[])
                 AND NOT EXISTS (SELECT 1 FROM blueprint.crew_members m WHERE m.crew_id = c.id)
              RETURNING c.id
            `;
            emptiedCrews = dissolved.length;
          }

          return {
            blueprintId,
            removed: {
              blueprints: blueprints.length,
              crewMemberships: memberships.length,
              matchRuns: matchRuns.length,
              mentorMatches: mentorMatches.length,
              emptiedCrews,
            },
          };
        },
        { isolation: 'serializable', maxAttempts: 5 },
      );

      const erasedAt = new Date().toISOString();

      if (outcome.blueprintId) {
        await this.bus.publish(
          'blueprintDeleted',
          { blueprintId: outcome.blueprintId, userId: input.userId, erasedAt },
          // Keyed on the user, not the blueprint: a consumer that sees this
          // twice must clear `profiles.blueprint_id` once, and the second
          // delivery must be a no-op rather than a second clear of a field the
          // user has since legitimately repopulated by onboarding again.
          { idempotencyKey: `blueprint.erase:${input.userId}` },
        );
      }

      return { userId: input.userId, erasedAt, removed: outcome.removed };
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  /**
   * Announce the Blueprint and the placement.
   *
   * Neither payload carries a single field of the profile — §10. What
   * svc-identity needs is the id; what svc-academy needs is the crew; neither
   * needs to know how anyone decides.
   */
  private async announce(blueprint: BlueprintRecord, placement: Placement, userId: string): Promise<void> {
    await this.bus.publish(
      'blueprintCreated',
      {
        blueprintId: blueprint.id,
        userId,
        engineVersion: blueprint.engineVersion,
        visibility: blueprint.visibility,
      },
      { idempotencyKey: `blueprint.created:${blueprint.id}` },
    );

    const sized = await this.sql<Array<{ count: number; role: CrewRole }>>`
      SELECT (SELECT COUNT(*)::int FROM blueprint.crew_members WHERE crew_id = ${placement.crewId}) AS count,
             (SELECT role FROM blueprint.crew_members WHERE crew_id = ${placement.crewId} AND user_id = ${userId}) AS role
    `;
    const row = sized[0];
    if (!row?.role) return;

    await this.bus.publish(
      'crewMemberCreated',
      {
        crewId: placement.crewId,
        userId,
        role: row.role,
        crewSize: row.count,
        matchRunId: placement.matchRunId,
      },
      // Keyed on the membership, not the run: re-running onboarding produces a
      // new match run but the same membership, and a consumer opening a crew
      // channel must not open a second one.
      { idempotencyKey: `blueprint.placed:${placement.crewId}:${userId}` },
    );
  }
}

function toBlueprintRecord(row: BlueprintRow): BlueprintRecord {
  return {
    id: row.id,
    userId: row.user_id,
    engineVersion: row.engine_version,
    profile: row.profile,
    cardAssetUrl: row.card_asset_url,
    visibility: row.visibility,
    createdAt: row.created_at.toISOString(),
  };
}

function toMentorMatch(row: { student_id: string; mentor_id: string; fit_score: number; status: string }): MentorMatch {
  return {
    studentId: row.student_id,
    mentorId: row.mentor_id,
    fitScore: row.fit_score,
    status: row.status as MentorMatch['status'],
  };
}
