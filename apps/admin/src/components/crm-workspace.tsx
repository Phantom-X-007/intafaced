'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { founderName, useFounderOwners } from './founder-names';
import { CrmMetrics, CrmTasks, CrmCampaigns, CrmDuplicates, CrmExports, CrmEnquiryTasks } from './crm-workflows';
import { CrmMessages } from './crm-messages';
import { CrmPrivacy } from './crm-privacy';
import type {
  CrmActivity,
  CrmContact,
  CrmOpportunity,
  CrmOpportunityPage,
  CrmOrganisation,
  CrmSubmission,
  CrmTask,
  CrmWorkflowsContract,
} from '@intafaced/contracts';

type Detail = {
  opportunity: CrmOpportunity;
  contact: CrmContact;
  organisation: CrmOrganisation | null;
  submission: CrmSubmission;
  activities: CrmActivity[];
  tasks: CrmTask[];
  deliveries?: Array<{ status: string; errorCode: string | null }>;
  provenance: NonNullable<Awaited<ReturnType<CrmWorkflowsContract['getContactProvenance']>>>;
};
const AUDIENCES = ['investor', 'trader', 'merchant', 'academy', 'partner'] as const;
const label = (value: string) => value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const date = (value: string) => new Date(value).toLocaleString();

function stagesForAudience(audience: string): string[] {
  if (audience === 'investor') return ['new', 'qualified', 'diligence', 'terms', 'closed'];
  if (audience) return ['new', 'qualified', 'invited', 'onboarding', 'closed'];
  return ['new', 'qualified', 'diligence', 'terms', 'invited', 'onboarding', 'closed'];
}

function answerText(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value && typeof value === 'object' && 'status' in value) {
    if (value.status === 'stated' && 'amount' in value && 'currency' in value) {
      const period = 'period' in value ? ` / ${String(value.period)}` : '';
      return `${String(value.amount)} ${String(value.currency)}${period} (indicative)`;
    }
    return label(String(value.status));
  }
  if (['investorType', 'participation', 'decisionRole', 'timing', 'experience', 'role'].includes(key)) return label(String(value));
  return String(value);
}

async function readJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, cache: 'no-store' });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Your founder session is unavailable. Sign in again.');
    if (response.status === 409 || response.status === 412)
      throw new Error('The enquiry changed or this action was refused. Refresh and review before retrying.');
    throw new Error('The workspace could not confirm this request. Refresh the enquiry before retrying.');
  }
  return (await response.json()) as T;
}

export function CrmWorkspace({ csrf }: { csrf: string }) {
  const [view, setView] = useState('enquiries');
  const [workflowVersion, setWorkflowVersion] = useState(0);
  const [page, setPage] = useState<CrmOpportunityPage | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const owners = useFounderOwners();
  const [audience, setAudience] = useState('investor');
  const [stageFilter, setStageFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [note, setNote] = useState('');
  const [newOwner, setNewOwner] = useState('');
  const [newStage, setNewStage] = useState('new');
  const [reason, setReason] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [actionDue, setActionDue] = useState('');
  const [disposition, setDisposition] = useState('proceeded');
  const [evidence, setEvidence] = useState('');
  const pending = useRef(new Map<string, { inputKey: string; requestId: string }>());
  const sequence = useRef(0);
  const filters = new URLSearchParams({
    limit: '50',
    ...(audience ? { audience } : {}),
    ...(stageFilter ? { stage: stageFilter } : {}),
    ...(ownerFilter ? { ownerUserId: ownerFilter } : {}),
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(cursor ? { cursor } : {}),
  }).toString();
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await readJson<CrmOpportunityPage>(`/api/crm?${filters}`);
      if (current === sequence.current) setPage(result);
    } catch (failure) {
      if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Workspace unavailable.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    void load();
  }, [load]);
  async function open(id: string, manageBusy = true) {
    if (manageBusy) setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await readJson<Detail | null>(`/api/crm?opportunityId=${encodeURIComponent(id)}`);
      if (!result) throw new Error('This enquiry could not be found.');
      setDetail(result);
      setNewOwner(result.opportunity.ownerUserId);
      setNewStage(result.opportunity.stage);
      setActionDescription(result.opportunity.nextAction?.description ?? '');
      const due = result.opportunity.nextAction?.dueAt;
      setActionDue(due ? new Date(Date.parse(due) - new Date(due).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
      setReason('');
      setEvidence('');
      setNote('');
      return true;
    } catch (failure) {
      // Keep the last loaded record when a confirmed write's refresh fails.
      setDetail((current) => (!manageBusy && current?.opportunity.id === id ? current : null));
      setError(failure instanceof Error ? failure.message : 'Enquiry unavailable.');
      return false;
    } finally {
      if (manageBusy) setBusy(false);
    }
  }
  async function mutate(action: string, input: Record<string, unknown>) {
    if (!detail) return;
    setBusy(true);
    setError('');
    setNotice('');
    const inputKey = JSON.stringify(input);
    const previous = pending.current.get(action);
    const requestId = previous?.inputKey === inputKey ? previous.requestId : crypto.randomUUID();
    pending.current.set(action, { inputKey, requestId });
    try {
      await readJson('/api/crm', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-intafaced-csrf': csrf },
        body: JSON.stringify({ action, input: { ...input, requestId } }),
      });
      pending.current.delete(action);
      if (action === 'addNote') setNote('');
      const refreshed = await open(detail.opportunity.id, false);
      await load();
      setWorkflowVersion((value) => value + 1);
      setNotice(refreshed ? 'Saved to the enquiry history.' : 'Your change was saved. Reopen the enquiry to load its latest records.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }
  const items = page?.items ?? [];
  const contacts = new Map(page?.contacts.map((contact) => [contact.id, contact]) ?? []);
  const stages = stagesForAudience(audience);
  const resetPage = () => {
    setCursor(null);
    setHistory([]);
  };
  let pageSummary = 'Workspace unavailable';
  if (loading) pageSummary = 'Loading enquiries…';
  else if (page) {
    const overdue = items.filter((item) => item.nextAction && Date.parse(item.nextAction.dueAt) < Date.now()).length;
    pageSummary = `${items.length} enquiries on this page · ${overdue} overdue`;
  }
  return (
    <section className="adm-workspace">
      <div className="adm-workspace-heading">
        <div>
          <p className="adm-eyebrow">Relationships</p>
          <h1>Outreach CRM</h1>
          <p>Review enquiries, assign follow-up and keep the original answers together.</p>
        </div>
        <button
          onClick={() => {
            void load();
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      <CrmMetrics
        key={workflowVersion}
        filters={{
          ...(audience ? { audience } : {}),
          ...(stageFilter ? { stage: stageFilter } : {}),
          ...(ownerFilter ? { ownerUserId: ownerFilter } : {}),
        }}
        onTasks={() => setView('tasks')}
      />
      <nav className="adm-crm-tabs" aria-label="CRM workflows">
        {['enquiries', 'tasks', 'campaigns', 'duplicates', 'exports'].map((value) => (
          <button key={value} type="button" aria-current={view === value ? 'page' : undefined} onClick={() => setView(value)}>
            {label(value)}
          </button>
        ))}
      </nav>
      {(view === 'enquiries' || view === 'exports') && (
        <form
          className="adm-filters"
          onSubmit={(event) => {
            event.preventDefault();
            resetPage();
            void load();
          }}
        >
          <label>
            Audience
            <select
              aria-label="Audience"
              value={audience}
              onChange={(event) => {
                setAudience(event.target.value);
                setStageFilter('');
                resetPage();
              }}
            >
              <option value="">All audiences</option>
              {AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stage
            <select
              aria-label="Stage"
              value={stageFilter}
              onChange={(event) => {
                setStageFilter(event.target.value);
                resetPage();
              }}
            >
              <option value="">All stages</option>
              {stages.map((value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <select
              aria-label="Owner"
              value={ownerFilter}
              onChange={(event) => {
                setOwnerFilter(event.target.value);
                resetPage();
              }}
            >
              <option value="">Both founders</option>
              {owners.map((value) => (
                <option key={value.userId} value={value.userId}>
                  {value.displayName}
                </option>
              ))}
            </select>
          </label>
          {view === 'enquiries' && (
            <label>
              Search
              <input
                aria-label="Search"
                type="search"
                placeholder="Name or email"
                maxLength={160}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
              />
            </label>
          )}
        </form>
      )}
      {error && (
        <p className="adm-alert" role="alert">
          {error} <a href="/login">Sign in</a>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {view === 'tasks' && (
        <CrmTasks
          owners={owners}
          onOpen={(id) => {
            setView('enquiries');
            void open(id);
          }}
        />
      )}
      {view === 'campaigns' && <CrmCampaigns csrf={csrf} owners={owners} />}
      {view === 'duplicates' && (
        <CrmDuplicates
          csrf={csrf}
          owners={owners}
          onChanged={async () => {
            await load();
            if (detail) await open(detail.opportunity.id, false);
            setWorkflowVersion((value) => value + 1);
          }}
        />
      )}
      {view === 'exports' && (
        <CrmExports
          csrf={csrf}
          owners={owners}
          filters={{
            ...(audience ? { audience } : {}),
            ...(stageFilter ? { stage: stageFilter } : {}),
            ...(ownerFilter ? { ownerUserId: ownerFilter } : {}),
          }}
        />
      )}
      {view === 'enquiries' && (
        <>
          <div className="adm-workspace-grid">
            <div>
              <p className="adm-subtle">{pageSummary}</p>
              <div className="adm-table-scroll">
                <table className="adm-crm-table">
                  <caption className="adm-sr-only">Enquiries matching your filters</caption>
                  <thead>
                    <tr>
                      <th>Contact</th>
                      <th>Audience / stage</th>
                      <th>Next action</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const contact = contacts.get(item.contactId);
                      return (
                        <tr key={item.id}>
                          <td>
                            <button
                              className="adm-text-button"
                              disabled={busy}
                              onClick={() => {
                                void open(item.id);
                              }}
                            >
                              {contact?.name ?? 'Open enquiry'}
                            </button>
                            <small>{contact?.email}</small>
                          </td>
                          <td>
                            {label(item.audience)}
                            <small>{label(item.stage)}</small>
                          </td>
                          <td>
                            {item.nextAction ? (
                              <>
                                {item.nextAction.description}
                                <small>{date(item.nextAction.dueAt)}</small>
                              </>
                            ) : (
                              label(item.closedDisposition ?? 'Closed')
                            )}
                          </td>
                          <td title={item.ownerUserId}>{founderName(owners, item.ownerUserId)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!loading && page && items.length === 0 && <p className="adm-empty">No enquiries match these filters.</p>}
              <div className="adm-pagination">
                <button
                  disabled={loading || history.length === 0}
                  onClick={() => {
                    setCursor(history.at(-1) ?? null);
                    setHistory((values) => values.slice(0, -1));
                  }}
                >
                  Previous
                </button>
                <button
                  disabled={loading || !page?.nextCursor}
                  onClick={() => {
                    setHistory((values) => [...values, cursor]);
                    setCursor(page?.nextCursor ?? null);
                  }}
                >
                  Next
                </button>
              </div>
              <p className="adm-provider-status">
                Papermark Free · API access unavailable. Deck views cannot be imported on this plan; a source link does not verify a reader.
              </p>
            </div>
            <aside className="adm-detail" aria-label="Enquiry details">
              {!detail ? (
                <p>Select an enquiry to review its answers and follow-up.</p>
              ) : (
                <>
                  <p className="adm-eyebrow">{label(detail.opportunity.audience)} enquiry</p>
                  <h2>{detail.contact.name}</h2>
                  <a href={`mailto:${detail.contact.email}`}>{detail.contact.email}</a>
                  <p className="adm-subtle">
                    Email {detail.contact.emailEvidence.status} · captured {date(detail.submission.capturedAt)}
                  </p>
                  {detail.organisation && <p>{detail.organisation.name}</p>}
                  <section className="adm-original-contact">
                    <p className="adm-eyebrow">Immutable original enquiry</p>
                    <strong>{detail.submission.contact.name}</strong>
                    <p>{detail.submission.contact.email}</p>
                    <p className="adm-subtle">
                      Selected interests: {detail.submission.contact.interests.map(label).join(', ')} · news consent{' '}
                      {detail.submission.contact.marketingOptIn ? 'opted in' : 'not given'}
                    </p>
                    {detail.provenance.originalContact.id !== detail.provenance.canonicalContact.id && (
                      <p className="adm-subtle">
                        This original enquiry is linked to {detail.provenance.canonicalContact.name}. Original contact details and answers
                        remain preserved.
                      </p>
                    )}
                    <p className="adm-subtle">
                      First known source: {detail.provenance.firstKnownSource?.campaign?.name ?? 'Unknown'} · Latest known source:{' '}
                      {detail.provenance.latestKnownSource?.campaign?.name ?? 'Unknown'}. Recipient identity is unknown.
                    </p>
                  </section>
                  <h3>Original answers</h3>
                  <p>
                    {detail.submission.questionnaires.length} of {detail.submission.contact.interests.length} selected questionnaires
                    completed.
                  </p>
                  {detail.submission.questionnaires.map((questionnaire) => (
                    <section key={questionnaire.audience}>
                      <h4>{label(questionnaire.audience)}</h4>
                      <dl className="adm-answers">
                        {Object.entries(questionnaire.answers).map(([key, value]) => (
                          <div key={key}>
                            <dt>{label(key.replace(/([A-Z])/g, ' $1'))}</dt>
                            <dd>{answerText(key, value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                  <form
                    className="adm-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate('assign', {
                        opportunityId: detail.opportunity.id,
                        expectedRevision: detail.opportunity.revision,
                        ownerUserId: newOwner,
                      });
                    }}
                  >
                    <h3>Follow-up owner</h3>
                    <label>
                      Founder
                      <select aria-label="Founder" value={newOwner} onChange={(event) => setNewOwner(event.target.value)}>
                        {owners.map((value) => (
                          <option key={value.userId} value={value.userId}>
                            {value.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" disabled={busy || owners.length !== 2 || newOwner === detail.opportunity.ownerUserId}>
                      Assign owner
                    </button>
                  </form>
                  <form
                    className="adm-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate('changeStage', {
                        opportunityId: detail.opportunity.id,
                        expectedRevision: detail.opportunity.revision,
                        stage: newStage,
                        reason,
                        nextAction:
                          newStage === 'closed' ? null : { description: actionDescription, dueAt: new Date(actionDue).toISOString() },
                        closedDisposition: newStage === 'closed' ? disposition : null,
                        closingEvidenceRef: newStage === 'closed' ? evidence : null,
                      });
                    }}
                  >
                    <h3>Stage and next action</h3>
                    <label>
                      Stage
                      <select aria-label="Stage" value={newStage} onChange={(event) => setNewStage(event.target.value)}>
                        {(detail.opportunity.audience === 'investor'
                          ? ['new', 'qualified', 'diligence', 'terms', 'closed']
                          : ['new', 'qualified', 'invited', 'onboarding', 'closed']
                        ).map((value) => (
                          <option key={value} value={value}>
                            {label(value)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Reason
                      <input
                        aria-label="Reason"
                        required
                        maxLength={500}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </label>
                    {newStage === 'closed' ? (
                      <>
                        <label>
                          Outcome
                          <select aria-label="Outcome" value={disposition} onChange={(event) => setDisposition(event.target.value)}>
                            {['proceeded', 'declined', 'withdrawn', 'waitlisted', 'duplicate'].map((value) => (
                              <option key={value} value={value}>
                                {label(value)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Decision evidence
                          <input
                            aria-label="Decision evidence"
                            required
                            maxLength={256}
                            value={evidence}
                            onChange={(event) => setEvidence(event.target.value)}
                          />
                        </label>
                        <p className="adm-subtle">Closing this enquiry records a decision. Contributions remain indicative.</p>
                      </>
                    ) : (
                      <>
                        <label>
                          Next action
                          <input
                            aria-label="Next action"
                            required
                            maxLength={160}
                            value={actionDescription}
                            onChange={(event) => setActionDescription(event.target.value)}
                          />
                        </label>
                        <label>
                          Due at (your local time)
                          <input
                            aria-label="Due at (your local time)"
                            type="datetime-local"
                            required
                            value={actionDue}
                            onChange={(event) => setActionDue(event.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <button type="submit" disabled={busy}>
                      Save stage and follow-up
                    </button>
                  </form>
                  <form
                    className="adm-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void mutate('addNote', { opportunityId: detail.opportunity.id, note });
                    }}
                  >
                    <h3>Activity note</h3>
                    <label>
                      Note
                      <textarea
                        aria-label="Note"
                        required
                        maxLength={2000}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busy || !note.trim()}>
                      Add note
                    </button>
                  </form>
                  <CrmEnquiryTasks
                    key={`tasks:${detail.opportunity.id}`}
                    csrf={csrf}
                    opportunity={detail.opportunity}
                    owners={owners}
                    onSaved={async () => {
                      const refreshed = await open(detail.opportunity.id, false);
                      await load();
                      setWorkflowVersion((value) => value + 1);
                      return refreshed;
                    }}
                  />
                  <h3>History</h3>
                  <ol className="adm-history">
                    {detail.activities.map((activity) => (
                      <li key={activity.id}>
                        <strong>{label(activity.kind)}</strong>
                        <small>
                          {date(activity.occurredAt)} ·{' '}
                          {activity.actor.kind === 'operator' ? founderName(owners, activity.actor.userId) : label(activity.actor.kind)}
                        </small>
                        {activity.note && <p>{activity.note}</p>}
                      </li>
                    ))}
                  </ol>
                  <CrmMessages
                    key={`messages:${detail.opportunity.id}`}
                    csrf={csrf}
                    opportunity={detail.opportunity}
                    originalRecipient={detail.submission.contact}
                    owners={owners}
                    onSaved={async () => {
                      const refreshed = await open(detail.opportunity.id, false);
                      await load();
                      setWorkflowVersion((value) => value + 1);
                      return refreshed;
                    }}
                  />
                  {detail.deliveries && (
                    <>
                      <h3>Enquiry acknowledgement</h3>
                      {detail.deliveries.map((delivery, index) => (
                        <p key={index}>
                          {label(delivery.status)}
                          {delivery.errorCode ? ` · ${label(delivery.errorCode.replace(/^ops\.crm\./, ''))}` : ''}
                        </p>
                      ))}
                    </>
                  )}
                  <CrmPrivacy
                    key={`privacy:${detail.provenance.canonicalContact.id}`}
                    csrf={csrf}
                    canonicalContact={detail.provenance.canonicalContact}
                    owners={owners}
                    onComplete={async () => {
                      const erasedContactId = detail.provenance.canonicalContact.id;
                      setDetail((current) => (current?.provenance.canonicalContact.id === erasedContactId ? null : current));
                      setNotice('Linked contact records deleted from outreach.');
                      await load();
                      setWorkflowVersion((value) => value + 1);
                    }}
                  />
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
