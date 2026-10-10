import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Sql } from 'postgres';
import { transaction } from '@intafaced/db';
import {
  crmActivitySchema,
  crmAssignmentInputSchema,
  crmContactSchema,
  crmListInputSchema,
  crmNoteInputSchema,
  crmOpportunitySchema,
  crmOpportunityPageSchema,
  crmOrganisationSchema,
  crmStageChangeInputSchema,
  crmStageFitsAudience,
  crmSubmissionSchema,
  crmTaskSchema,
  outreachCaptureInputSchema,
  outreachContinuationInputSchema,
  outreachDraftSchema,
  outreachQuestionnaireInputSchema,
  type CrmActivity,
  type CrmAssignmentInput,
  type CrmListInput,
  type CrmNoteInput,
  type CrmOpportunity,
  type CrmStageChangeInput,
  type OutreachCaptureInput,
  type OutreachContinuationInput,
  type OutreachQuestionnaireInput,
  type OutreachDraft,
} from '@intafaced/contracts';
import { nextReviewAt, OutreachError, outreachConfigSchema, type OutreachConfig } from './config.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fingerprint = (value: unknown) => hash(canonical(value));
function normalizeIds<T extends { requestId?: string; submissionId?: string; opportunityId?: string; ownerUserId?: string }>(input: T): T {
  for (const field of ['requestId', 'submissionId', 'opportunityId', 'ownerUserId'] as const) {
    const value = input[field];
    if (value !== undefined) input[field] = value.toLowerCase();
  }
  return input;
}
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type SubmissionRow = { id: string; contact_id: string; capability_hash: string; expires_at: Date; revision: number; record: unknown };

/** One persistence boundary for intake and staff workflow. No public email lookup exists. */
export class OutreachCrm {
  constructor(
    private readonly sql: Sql | null,
    private readonly configuration: unknown,
    private readonly now: () => Date = () => new Date(),
  ) {}
  private configured(): { sql: Sql; config: OutreachConfig } {
    if (!this.sql) throw new OutreachError('ops.crm.storage_unconfigured');
    const parsed = outreachConfigSchema.safeParse(this.configuration);
    if (!parsed.success) throw new OutreachError('ops.crm.configuration_unverified');
    return { sql: this.sql, config: parsed.data };
  }
  private async write<T>(
    fn: (tx: Sql, config: OutreachConfig) => Promise<T>,
    isolation: 'read committed' | 'repeatable read' = 'read committed',
  ): Promise<T> {
    const { sql, config } = this.configured();
    try {
      return await transaction(sql, (tx) => fn(tx, config), { isolation });
    } catch (error) {
      if (error instanceof OutreachError || (error instanceof Error && error.name === 'ZodError')) throw error;
      throw new OutreachError('ops.crm.storage_unavailable');
    }
  }
  private async publicRate(abuseKey: string): Promise<void> {
    const attempts = await this.write(async (tx) => this.rate(tx, abuseKey));
    if (attempts > 30) throw new OutreachError('ops.crm.rate_limited');
  }
  private async rate(tx: Sql, abuseKey: string): Promise<number> {
    if (!abuseKey) throw new OutreachError('ops.crm.abuse_context_unavailable');
    const key = hash(abuseKey);
    const window = new Date(Math.floor(this.now().getTime() / 60000) * 60000);
    const rows = await tx`INSERT INTO ops.crm_rate_windows(key_hash,window_start,attempts) VALUES (${key},${window},1)
      ON CONFLICT(key_hash,window_start) DO UPDATE SET attempts=ops.crm_rate_windows.attempts+1 RETURNING attempts`;
    return Number(rows[0]?.attempts);
  }
  private async lockRequest(tx: Sql, id: string): Promise<void> {
    await tx`SELECT pg_advisory_xact_lock(hashtext('ops.crm.request:' || ${id}))`;
  }
  private async replay(tx: Sql, requestId: string, actor: string, operation: string, input: unknown): Promise<unknown | null> {
    const rows = await tx`SELECT actor_key,operation,fingerprint,result FROM ops.crm_requests WHERE request_id=${requestId}`;
    const row = rows[0];
    if (!row) return null;
    if (row.actor_key !== actor || row.operation !== operation || row.fingerprint !== fingerprint(input))
      throw new OutreachError('ops.crm.idempotency_conflict');
    return row.result;
  }
  private async remember(
    tx: Sql,
    requestId: string,
    actor: string,
    operation: string,
    input: unknown,
    result: unknown,
    submissionId: string,
  ): Promise<void> {
    await tx`INSERT INTO ops.crm_requests(request_id,actor_key,operation,fingerprint,result,submission_id)
      VALUES (${requestId},${actor},${operation},${fingerprint(input)},${tx.json(JSON.parse(JSON.stringify(result)))},${submissionId})`;
  }
  private async authenticate(tx: Sql, input: OutreachContinuationInput): Promise<SubmissionRow> {
    const rows = await tx<SubmissionRow[]>`SELECT * FROM ops.crm_submissions WHERE id=${input.submissionId} FOR UPDATE`;
    const row = rows[0];
    if (!row || !sameHash(row.capability_hash, hash(input.continuationToken)) || new Date(row.expires_at).getTime() <= this.now().getTime())
      throw new OutreachError('ops.crm.continuation_invalid');
    return row;
  }
  private draft(row: SubmissionRow): OutreachDraft {
    const { contactId: _contactId, ...submission } = crmSubmissionSchema.parse(row.record);
    return outreachDraftSchema.parse({ ...submission, continuationExpiresAt: new Date(row.expires_at).toISOString() });
  }
  async capture(raw: OutreachCaptureInput, abuseKey: string) {
    const input = normalizeIds(outreachCaptureInputSchema.parse(raw));
    await this.publicRate(abuseKey);
    return this.write(async (tx, config) => {
      await this.lockRequest(tx, input.requestId);
      const previous = await tx`SELECT submission_id FROM ops.crm_requests WHERE request_id=${input.requestId}`;
      // Authenticate the capability BEFORE revealing/replaying the previous result.
      if (previous[0]) {
        await this.authenticate(tx, { submissionId: String(previous[0].submission_id), continuationToken: input.continuationToken });
        const replay = await this.replay(tx, input.requestId, 'prospect', 'capture', { ...input, continuationToken: undefined });
        return outreachCaptureReceipt(replay);
      }
      const submissionId = randomUUID(),
        contactId = randomUUID();
      const at = this.now().toISOString();
      const expires = new Date(this.now().getTime() + config.continuationTtlSeconds * 1000).toISOString();
      const organisationId = input.contact.organisationName ? randomUUID() : null;
      const contact = crmContactSchema.parse({
        id: contactId,
        name: input.contact.name,
        email: input.contact.email,
        emailEvidence: { status: 'unverified' },
        organisationIds: organisationId ? [organisationId] : [],
        interests: input.contact.interests,
        platformIdentity: null,
        createdAt: at,
        updatedAt: at,
      });
      await tx`INSERT INTO ops.crm_contacts(id,record) VALUES (${contactId},${tx.json(contact)})`;
      if (organisationId) {
        const org = crmOrganisationSchema.parse({
          id: organisationId,
          name: input.contact.organisationName,
          website: null,
          countries: input.contact.country ? [input.contact.country] : [],
          createdAt: at,
        });
        await tx`INSERT INTO ops.crm_organisations(id,record) VALUES (${organisationId},${tx.json(org)})`;
        await tx`INSERT INTO ops.crm_contact_organisations(contact_id,organisation_id) VALUES (${contactId},${organisationId})`;
      }
      const submission = crmSubmissionSchema.parse({
        submissionId,
        contactId,
        revision: 1,
        contact: input.contact,
        questionnaires: [],
        capturedAt: at,
        completedAt: null,
      });
      // Untrusted source keys remain opaque hints. They establish neither campaign nor recipient identity.
      await tx`INSERT INTO ops.crm_submissions(id,contact_id,capability_hash,expires_at,revision,record,original_contact,attribution)
        VALUES (${submissionId},${contactId},${hash(input.continuationToken)},${expires},1,${tx.json(submission)},${tx.json(input.contact)},${tx.json({ sourceHint: input.sourceKey ?? null, recipientLinkage: 'unknown', campaign: null })})`;
      const dueAt = nextReviewAt(this.now(), config);
      for (const audience of input.contact.interests) {
        const opportunity = crmOpportunitySchema.parse({
          id: randomUUID(),
          contactId,
          organisationId,
          submissionId,
          audience,
          stage: 'new',
          ownerUserId: config.initialOwnerUserId,
          revision: 1,
          nextAction: { description: 'Review enquiry', dueAt },
          closedDisposition: null,
          closingEvidenceRef: null,
          createdAt: at,
          updatedAt: at,
          ...(audience === 'investor' ? { indicativeContribution: { status: 'undecided' } } : {}),
        });
        await tx`INSERT INTO ops.crm_opportunities(id,submission_id,contact_id,organisation_id,audience,stage,owner_user_id,revision,created_at,record)
          VALUES (${opportunity.id},${submissionId},${contactId},${organisationId},${audience},'new',${opportunity.ownerUserId},1,${at},${tx.json(opportunity)})`;
        await this.task(tx, opportunity);
        await this.activity(tx, opportunity.id, { kind: 'system', jobId: submissionId }, 'assigned', null, config.initialOwnerUserId);
      }
      await tx`INSERT INTO ops.crm_outbox(id,business_key,submission_id,kind,status,payload,created_at,updated_at,error_code)
        VALUES (${randomUUID()},${`acknowledgement:${submissionId}`},${submissionId},'enquiry_acknowledgement','unconfigured',${tx.json({ contactId, audiences: input.contact.interests, marketingPermission: input.contact.marketingOptIn })},${at},${at},'ops.crm.notification_unconfigured')`;
      const receipt = { submissionId, revision: 1, capturedAt: at, continuationExpiresAt: expires };
      await this.remember(tx, input.requestId, 'prospect', 'capture', { ...input, continuationToken: undefined }, receipt, submissionId);
      return receipt;
    });
  }
  async resume(raw: OutreachContinuationInput, abuseKey: string) {
    const input = normalizeIds(outreachContinuationInputSchema.parse(raw));
    await this.publicRate(abuseKey);
    return this.write(async (tx) => {
      return this.draft(await this.authenticate(tx, input));
    });
  }
  async answer(raw: OutreachQuestionnaireInput, abuseKey: string) {
    const input = normalizeIds(outreachQuestionnaireInputSchema.parse(raw));
    await this.publicRate(abuseKey);
    return this.write(async (tx) => {
      await this.lockRequest(tx, input.requestId);
      const row = await this.authenticate(tx, input);
      const businessInput = { ...input, continuationToken: undefined };
      const replay = await this.replay(tx, input.requestId, `prospect:${row.id}`, 'answer', businessInput);
      if (replay !== null) return outreachDraftSchema.parse(replay);
      const old = crmSubmissionSchema.parse(row.record);
      if (old.revision !== input.expectedRevision) throw new OutreachError('ops.crm.revision_conflict');
      if (!old.contact.interests.includes(input.questionnaire.audience)) throw new OutreachError('ops.crm.audience_not_selected');
      if (old.questionnaires.some((q) => q.audience === input.questionnaire.audience))
        throw new OutreachError('ops.crm.answers_already_preserved');
      const questionnaires = [...old.questionnaires, input.questionnaire];
      const updated = crmSubmissionSchema.parse({
        ...old,
        revision: old.revision + 1,
        questionnaires,
        completedAt: questionnaires.length === old.contact.interests.length ? this.now().toISOString() : null,
      });
      await tx`UPDATE ops.crm_submissions SET revision=${updated.revision},record=${tx.json(updated)} WHERE id=${row.id}`;
      const opportunities =
        await tx`SELECT record FROM ops.crm_opportunities WHERE submission_id=${row.id} AND audience=${input.questionnaire.audience} FOR UPDATE`;
      const opportunity = crmOpportunitySchema.parse(opportunities[0]?.record);
      if (input.questionnaire.audience === 'investor' && opportunity.audience === 'investor')
        await this.saveOpportunity(tx, {
          ...opportunity,
          indicativeContribution: input.questionnaire.answers.indicativeContribution,
          revision: opportunity.revision + 1,
          updatedAt: this.now().toISOString(),
        });
      await this.activity(tx, opportunity.id, { kind: 'prospect', submissionId: row.id }, 'questionnaire_submitted', null, input.requestId);
      const draft = this.draft({ ...row, record: updated });
      await this.remember(tx, input.requestId, `prospect:${row.id}`, 'answer', businessInput, draft, row.id);
      return draft;
    });
  }
  owners(): { ownerUserIds: string[]; initialOwnerUserId: string } {
    const { config } = this.configured();
    return { ownerUserIds: [...config.founders], initialOwnerUserId: config.initialOwnerUserId };
  }
  async listOpportunities(raw: CrmListInput) {
    const input = normalizeIds(crmListInputSchema.parse(raw));
    return this.write(async (tx) => {
      let cursor: { at: string; id: string } | null = null;
      if (input.cursor) {
        try {
          cursor = cursorSchema.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')));
        } catch {
          throw new OutreachError('ops.crm.cursor_invalid');
        }
      }
      const rows = await tx`SELECT o.record FROM ops.crm_opportunities o JOIN ops.crm_contacts c ON c.id=o.contact_id
        WHERE (${input.audience ?? null}::text IS NULL OR o.audience=${input.audience ?? null})
        AND (${input.stage ?? null}::text IS NULL OR o.stage=${input.stage ?? null})
        AND (${input.ownerUserId ?? null}::uuid IS NULL OR o.owner_user_id=${input.ownerUserId ?? null}::uuid)
        AND (${input.query ?? null}::text IS NULL OR strpos(lower(c.record->>'name'),lower(${input.query ?? ''}))>0 OR strpos(lower(c.record->>'email'),lower(${input.query ?? ''}))>0)
        AND (${cursor?.at ?? null}::timestamptz IS NULL OR (o.created_at,o.id)<(${cursor?.at ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
        ORDER BY o.created_at DESC,o.id DESC LIMIT ${input.limit + 1}`;
      const items = rows.slice(0, input.limit).map((r) => crmOpportunitySchema.parse(r.record));
      const last = items.at(-1);
      const contactIds = [...new Set(items.map((item) => item.contactId))];
      const contactRows = contactIds.length
        ? await tx`SELECT record FROM ops.crm_contacts WHERE id = ANY(${tx.array(contactIds)}::uuid[])`
        : [];
      return crmOpportunityPageSchema.parse({
        contacts: contactRows.map((row) => crmContactSchema.parse(row.record)),
        items,
        nextCursor:
          rows.length > input.limit && last ? Buffer.from(JSON.stringify({ at: last.createdAt, id: last.id })).toString('base64url') : null,
      });
    }, 'repeatable read');
  }
  async getOpportunity(input: { opportunityId: string }) {
    const opportunityId = uuidSchema.parse(input.opportunityId).toLowerCase();
    return this.write(async (tx) => {
      const rows = await tx`SELECT record FROM ops.crm_opportunities WHERE id=${opportunityId}`;
      if (!rows[0]) return null;
      const opportunity = crmOpportunitySchema.parse(rows[0].record);
      const deliveries =
        await tx`SELECT id,business_key,kind,status,attempts,acceptance_ref,error_code,created_at,updated_at FROM ops.crm_outbox WHERE submission_id=${opportunity.submissionId}`;
      const contacts = await tx`SELECT record FROM ops.crm_contacts WHERE id=${opportunity.contactId}`;
      const submissions = await tx`SELECT record FROM ops.crm_submissions WHERE id=${opportunity.submissionId}`;
      const organisations = opportunity.organisationId
        ? await tx`SELECT record FROM ops.crm_organisations WHERE id=${opportunity.organisationId}`
        : [];
      const activities = await tx`SELECT record FROM ops.crm_activities WHERE opportunity_id=${opportunityId} ORDER BY sequence`;
      const tasks = await tx`SELECT record FROM ops.crm_tasks WHERE opportunity_id=${opportunityId}`;
      return {
        opportunity,
        deliveries,
        contact: crmContactSchema.parse(contacts[0]?.record),
        submission: crmSubmissionSchema.parse(submissions[0]?.record),
        organisation: organisations[0] ? crmOrganisationSchema.parse(organisations[0].record) : null,
        activities: activities.map((r) => crmActivitySchema.parse(r.record)),
        tasks: tasks.map((r) => crmTaskSchema.parse(r.record)),
      };
    }, 'repeatable read');
  }
  private async mutate<T>(
    actorUserId: string,
    input: { requestId: string; opportunityId: string },
    operation: string,
    fn: (tx: Sql, opportunity: CrmOpportunity, config: OutreachConfig) => Promise<T>,
  ): Promise<T> {
    actorUserId = uuidSchema.parse(actorUserId).toLowerCase();
    return this.write(async (tx, config) => {
      if (!config.founders.includes(actorUserId)) throw new OutreachError('ops.crm.operator_forbidden');
      await this.lockRequest(tx, input.requestId);
      const replay = await this.replay(tx, input.requestId, `operator:${actorUserId}`, operation, input);
      if (replay !== null) return replay as T;
      const rows = await tx`SELECT record FROM ops.crm_opportunities WHERE id=${input.opportunityId} FOR UPDATE`;
      if (!rows[0]) throw new OutreachError('ops.crm.opportunity_not_found');
      const opportunity = crmOpportunitySchema.parse(rows[0].record);
      const result = await fn(tx, opportunity, config);
      await this.remember(tx, input.requestId, `operator:${actorUserId}`, operation, input, result, opportunity.submissionId);
      return result;
    });
  }
  async assign(raw: CrmAssignmentInput, actorUserId: string) {
    actorUserId = uuidSchema.parse(actorUserId).toLowerCase();
    const input = normalizeIds(crmAssignmentInputSchema.parse(raw));
    input.ownerUserId = input.ownerUserId.toLowerCase();
    return this.mutate(actorUserId, input, 'assign', async (tx, old, config) => {
      if (old.revision !== input.expectedRevision) throw new OutreachError('ops.crm.revision_conflict');
      if (!config.founders.includes(input.ownerUserId)) throw new OutreachError('ops.crm.owner_not_founder');
      const row = await this.saveOpportunity(tx, {
        ...old,
        ownerUserId: input.ownerUserId,
        revision: old.revision + 1,
        updatedAt: this.now().toISOString(),
      });
      await this.task(tx, row);
      await this.activity(tx, row.id, { kind: 'operator', userId: actorUserId }, 'assigned', null, input.ownerUserId);
      return row;
    });
  }
  async changeStage(raw: CrmStageChangeInput, actorUserId: string) {
    actorUserId = uuidSchema.parse(actorUserId).toLowerCase();
    const input = normalizeIds(crmStageChangeInputSchema.parse(raw));
    return this.mutate(actorUserId, input, 'changeStage', async (tx, old) => {
      if (old.revision !== input.expectedRevision) throw new OutreachError('ops.crm.revision_conflict');
      if (!crmStageFitsAudience(old.audience, input.stage)) throw new OutreachError('ops.crm.stage_invalid_for_audience');
      const row = await this.saveOpportunity(tx, {
        ...old,
        stage: input.stage,
        closedDisposition: input.closedDisposition,
        closingEvidenceRef: input.closingEvidenceRef,
        nextAction: input.nextAction,
        revision: old.revision + 1,
        updatedAt: this.now().toISOString(),
      });
      await this.task(tx, row);
      await this.activity(tx, row.id, { kind: 'operator', userId: actorUserId }, 'stage_changed', input.reason, input.requestId);
      return row;
    });
  }
  async addNote(raw: CrmNoteInput, actorUserId: string) {
    actorUserId = uuidSchema.parse(actorUserId).toLowerCase();
    const input = normalizeIds(crmNoteInputSchema.parse(raw));
    return this.mutate(actorUserId, input, 'addNote', (tx, row) =>
      this.activity(tx, row.id, { kind: 'operator', userId: actorUserId }, 'note', input.note, input.requestId),
    );
  }
  private async saveOpportunity(tx: Sql, raw: unknown): Promise<CrmOpportunity> {
    const row = crmOpportunitySchema.parse(raw);
    await tx`UPDATE ops.crm_opportunities SET stage=${row.stage},owner_user_id=${row.ownerUserId},revision=${row.revision},record=${tx.json(row)} WHERE id=${row.id}`;
    return row;
  }
  private async task(tx: Sql, opportunity: CrmOpportunity): Promise<void> {
    const previous = await tx`SELECT id,record FROM ops.crm_tasks WHERE opportunity_id=${opportunity.id} FOR UPDATE`;
    for (const p of previous) {
      const row = crmTaskSchema.parse(p.record);
      if (row.status === 'pending')
        await tx`UPDATE ops.crm_tasks SET record=${tx.json({ ...row, status: 'cancelled', updatedAt: this.now().toISOString() })} WHERE id=${row.id}`;
    }
    if (opportunity.nextAction) {
      const task = crmTaskSchema.parse({
        id: randomUUID(),
        opportunityId: opportunity.id,
        ownerUserId: opportunity.ownerUserId,
        ...opportunity.nextAction,
        status: 'pending',
        updatedAt: this.now().toISOString(),
      });
      await tx`INSERT INTO ops.crm_tasks(id,opportunity_id,record) VALUES (${task.id},${opportunity.id},${tx.json(task)})`;
    }
  }
  private async activity(
    tx: Sql,
    opportunityId: string,
    actor: CrmActivity['actor'],
    kind: CrmActivity['kind'],
    note: string | null,
    referenceId: string | null,
  ): Promise<CrmActivity> {
    const rows = await tx`SELECT COALESCE(MAX(sequence),0)+1 AS sequence FROM ops.crm_activities WHERE opportunity_id=${opportunityId}`;
    const activity = crmActivitySchema.parse({
      id: randomUUID(),
      opportunityId,
      sequence: Number(rows[0]?.sequence),
      kind,
      actor,
      note,
      referenceId,
      occurredAt: this.now().toISOString(),
    });
    await tx`INSERT INTO ops.crm_activities(id,opportunity_id,sequence,record) VALUES (${activity.id},${opportunityId},${activity.sequence},${tx.json(activity)})`;
    return activity;
  }
}
import { z } from 'zod';
import { outreachCaptureReceiptSchema } from '@intafaced/contracts';
const uuidSchema = z.string().uuid();
const cursorSchema = z.object({ at: z.string().datetime({ offset: true }), id: uuidSchema }).strict();
function outreachCaptureReceipt(value: unknown) {
  return outreachCaptureReceiptSchema.parse(value);
}
