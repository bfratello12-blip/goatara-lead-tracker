import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Flag,
  MessageSquare,
  Phone,
  Pin,
  Plus,
  Send,
  Users,
  X,
} from 'lucide-react';
import type { Activity, Company, Note, NoteKind, Task } from '../../shared/crm.ts';
import { useCRM, useSave } from '../context.tsx';
import { companyContact, dateLabel, dueLabel, isOverdue, money, relativeTime, websiteLabel } from '../lib.ts';
import {
  Avatar,
  Button,
  Empty,
  Field,
  IconButton,
  InlineError,
  Modal,
  Owner,
  Segmented,
  StatusBadge,
} from './ui.tsx';
import { TaskDialog } from './forms.tsx';

export function CompanyTable({ companies, compact = false }: { companies: Company[]; compact?: boolean }) {
  const { data } = useCRM();
  if (!companies.length) return <Empty title="No companies found" detail="No records match these filters." />;
  return (
    <div className="table-scroll">
      <table className={`data-table company-table ${compact ? 'compact' : ''}`}>
        <thead>
          <tr>
            <th>Company</th>
            {!compact && <th>Primary contact</th>}
            <th>Status</th>
            {!compact && <th>Monthly retainer</th>}
            <th>Follow-up</th>
            <th>Owner</th>
            <th>
              <span className="sr-only">Open company</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const contact = companyContact(data, company.id);
            return (
              <tr key={company.id}>
                <td>
                  <Link to={`/companies/${company.id}`} className="company-cell">
                    <Avatar company name={company.name} color={company.color} size="small" />
                    <span>
                      <strong>{company.name}</strong>
                      <span className="cell-secondary">
                        {compact
                          ? (contact?.name ?? websiteLabel(company.storeUrl))
                          : websiteLabel(company.storeUrl)}
                      </span>
                    </span>
                  </Link>
                </td>
                {!compact && (
                  <td>
                    <span className="contact-cell">
                      {contact?.name ?? <span className="muted">No contact</span>}
                      <span className="cell-secondary">{contact?.email}</span>
                    </span>
                  </td>
                )}
                <td>
                  <StatusBadge company={company} />
                </td>
                {!compact && (
                  <td className="numeric">
                    {money(company.dealValue)}
                    <span className="per-month">/mo</span>
                  </td>
                )}
                <td>
                  {company.followUpAt ? (
                    <span className={`due-date ${isOverdue(company.followUpAt) ? 'overdue' : ''}`}>
                      <Clock3 size={13} />
                      {dueLabel(company.followUpAt)}
                    </span>
                  ) : (
                    <span className="muted">Not set</span>
                  )}
                </td>
                <td>
                  <Owner user={data.team.find((member) => member.id === company.ownerId)} compact={compact} />
                </td>
                <td>
                  <Link
                    className="row-open"
                    to={`/companies/${company.id}`}
                    aria-label={`Open ${company.name}`}
                  >
                    <ArrowUpRight size={16} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TaskCheck({ task }: { task: Task }) {
  const [saving, setSaving] = useState(false);
  const { perform } = useCRM();
  async function toggle() {
    if (saving) return;
    setSaving(true);
    await perform(
      `/tasks/${task.id}`,
      'PATCH',
      { completed: !task.completedAt },
      task.completedAt ? 'Task reopened' : 'Task completed',
    );
    setSaving(false);
  }
  return (
    <button
      type="button"
      className={`task-check ${task.completedAt ? 'checked' : ''}`}
      disabled={saving}
      aria-label={`${task.completedAt ? 'Reopen' : 'Complete'} ${task.title}`}
      aria-pressed={Boolean(task.completedAt)}
      onClick={() => void toggle()}
    >
      {task.completedAt ? <CheckCircle2 size={20} /> : <Circle size={20} />}
    </button>
  );
}

export function TaskList({
  tasks,
  compact = false,
  showCompany = true,
}: {
  tasks: Task[];
  compact?: boolean;
  showCompany?: boolean;
}) {
  const { data } = useCRM();
  if (!tasks.length) return <Empty icon={CheckCircle2} title="All clear" detail="No tasks in this view." />;
  return (
    <div className={`task-list ${compact ? 'compact' : ''}`}>
      {tasks.map((task) => {
        const company = data.companies.find((item) => item.id === task.companyId);
        return (
          <div key={task.id} className={`task-row ${task.completedAt ? 'completed' : ''}`}>
            <TaskCheck task={task} />
            <div className="task-copy">
              <TaskDialog task={task}>
                <button className="task-title">{task.title}</button>
              </TaskDialog>
              <div className="task-meta">
                {showCompany && <Link to={`/companies/${task.companyId}`}>{company?.name}</Link>}
                <span className={`due-date ${!task.completedAt && isOverdue(task.dueAt) ? 'overdue' : ''}`}>
                  <CalendarClock size={12} />
                  {dueLabel(task.dueAt)}
                </span>
                {task.priority === 'high' && (
                  <Flag className="priority-high" size={12} aria-label="High priority" />
                )}
              </div>
            </div>
            {!compact && <Owner user={data.team.find((member) => member.id === task.assigneeId)} compact />}
          </div>
        );
      })}
    </div>
  );
}

function readDraft(key: string): { content: string; kind: NoteKind } {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? '{}') as { content?: unknown; kind?: unknown };
    return {
      content: typeof value.content === 'string' ? value.content : '',
      kind: value.kind === 'call' || value.kind === 'meeting' ? value.kind : 'note',
    };
  } catch {
    return { content: '', kind: 'note' };
  }
}

export function NoteComposer({
  companyId,
  onSaved,
  callSignal = 0,
  autoFocus = false,
}: {
  companyId: string;
  onSaved?: () => void;
  callSignal?: number;
  autoFocus?: boolean;
}) {
  const { session, mutate, notify } = useCRM();
  const storageKey = `goatara:draft:${session.user.id}:${companyId}`;
  const [draft, setDraft] = useState(() => readDraft(storageKey));
  const { saving, error, save } = useSave();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [draftStored, setDraftStored] = useState(false);
  useEffect(() => {
    try {
      if (draft.content) sessionStorage.setItem(storageKey, JSON.stringify(draft));
      else sessionStorage.removeItem(storageKey);
      setDraftStored(Boolean(draft.content));
    } catch {
      setDraftStored(false);
    }
  }, [draft, storageKey]);
  useEffect(() => {
    if (callSignal) {
      setDraft((previous) => ({ ...previous, kind: 'call' }));
      textarea.current?.focus();
    }
  }, [callSignal]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.content.trim()) return;
    const submitted = { ...draft };
    void save(async () => {
      await mutate(`/companies/${companyId}/notes`, 'POST', submitted);
      setDraft((previous) =>
        previous.content === submitted.content ? { ...previous, content: '' } : previous,
      );
      notify(submitted.kind === 'call' ? 'Call note saved' : 'Note saved');
      onSaved?.();
    });
  }
  return (
    <form className="note-composer" onSubmit={submit} ref={form}>
      <div className="composer-heading">
        <Segmented
          label="Note type"
          value={draft.kind}
          onChange={(kind) => setDraft((previous) => ({ ...previous, kind: kind as NoteKind }))}
          options={[
            {
              value: 'note',
              label: (
                <>
                  <FileText size={14} />
                  Note
                </>
              ),
            },
            {
              value: 'call',
              label: (
                <>
                  <Phone size={14} />
                  Call
                </>
              ),
            },
            {
              value: 'meeting',
              label: (
                <>
                  <Users size={14} />
                  Meeting
                </>
              ),
            },
          ]}
        />
        <span className="composer-private">
          <span className="status-dot" />
          Internal
        </span>
      </div>
      <textarea
        ref={textarea}
        autoFocus={autoFocus}
        aria-label="Write a note"
        value={draft.content}
        maxLength={100000}
        rows={5}
        placeholder={
          draft.kind === 'call'
            ? 'Capture the conversation...'
            : draft.kind === 'meeting'
              ? 'Decisions, discussion, and next steps...'
              : 'What would you like to remember?'
        }
        onChange={(event) => setDraft((previous) => ({ ...previous, content: event.target.value }))}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            form.current?.requestSubmit();
          }
        }}
      />
      <InlineError message={error} />
      <div className="composer-footer">
        <span className="draft-status">
          {draftStored ? (
            <>
              <Check size={13} />
              Draft saved in this tab
            </>
          ) : (
            <>
              <Avatar name={session.user.name} color={session.user.color} size="tiny" />
              {session.user.name}
            </>
          )}
        </span>
        <div className="inline-actions">
          {draft.content && (
            <IconButton
              label="Discard draft"
              onClick={() => setDraft((previous) => ({ ...previous, content: '' }))}
              disabled={saving}
            >
              <X size={15} />
            </IconButton>
          )}
          <Button type="submit" variant="primary" disabled={!draft.content.trim()} busy={saving}>
            <Send size={14} />
            Save note
          </Button>
        </div>
      </div>
    </form>
  );
}

export function NoteCard({ note, showCompany = false }: { note: Note; showCompany?: boolean }) {
  const { data, perform } = useCRM();
  const [saving, setSaving] = useState(false);
  const author = data.team.find((member) => member.id === note.authorId);
  const company = data.companies.find((item) => item.id === note.companyId);
  const TypeIcon = note.kind === 'call' ? Phone : note.kind === 'meeting' ? Users : FileText;
  return (
    <article className={`note-card ${note.pinned ? 'pinned' : ''}`} id={`note-${note.id}`}>
      <header className="note-card-header">
        <Avatar name={author?.name ?? 'Team member'} color={author?.color} size="small" />
        <div className="note-author">
          <strong>{author?.name ?? 'Team member'}</strong>
          <time dateTime={note.createdAt} title={dateLabel(note.createdAt, 'PPpp')}>
            {dateLabel(note.createdAt, 'MMM d, yyyy')}
            <span className="dot-separator" />
            {dateLabel(note.createdAt, 'h:mm a')}
          </time>
        </div>
        <span className="note-kind">
          <TypeIcon size={13} />
          {note.kind === 'call' ? 'Call' : note.kind === 'meeting' ? 'Meeting' : 'Note'}
        </span>
        <IconButton
          label={note.pinned ? 'Unpin note' : 'Pin note'}
          className={note.pinned ? 'is-pinned' : ''}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await perform(
              `/notes/${note.id}`,
              'PATCH',
              { pinned: !note.pinned },
              note.pinned ? 'Note unpinned' : 'Note pinned',
            );
            setSaving(false);
          }}
        >
          <Pin size={15} />
        </IconButton>
      </header>
      {showCompany && company && (
        <Link className="note-company" to={`/companies/${company.id}?tab=notes#note-${note.id}`}>
          {company.name}
          <ArrowUpRight size={13} />
        </Link>
      )}
      <p className="note-content">{note.content}</p>
      {note.pinned && (
        <span className="pinned-label">
          <Pin size={11} />
          Pinned note
        </span>
      )}
    </article>
  );
}

export function NewNoteDialog({ children }: { children?: ReactNode }) {
  const { data } = useCRM();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="New note"
      trigger={
        children ?? (
          <Button variant="primary">
            <Plus size={16} />
            New note
          </Button>
        )
      }
    >
      <div className="modal-body">
        <Field label="Company" required>
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Select a company</option>
            {data.companies
              .toSorted((first, second) => first.name.localeCompare(second.name))
              .map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
          </select>
        </Field>
        {companyId && (
          <div className="new-note-body">
            <NoteComposer key={companyId} companyId={companyId} onSaved={() => setOpen(false)} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ActivityList({
  activities,
  showCompany = true,
  compact = false,
}: {
  activities: Activity[];
  showCompany?: boolean;
  compact?: boolean;
}) {
  const { data } = useCRM();
  if (!activities.length) return <Empty icon={Clock3} title="No activity yet" />;
  return (
    <div className={`activity-list ${compact ? 'compact' : ''}`}>
      {activities.map((activity) => {
        const actor = data.team.find((member) => member.id === activity.actorId);
        const company = data.companies.find((item) => item.id === activity.companyId);
        const ActivityIcon =
          activity.type === 'note'
            ? MessageSquare
            : activity.type === 'task'
              ? Check
              : activity.type === 'stage'
                ? ArrowRight
                : activity.type === 'onboarding'
                  ? CheckCircle2
                  : activity.type === 'contact'
                    ? Users
                    : Plus;
        return (
          <div className="activity-row" key={activity.id}>
            <span className={`activity-icon activity-${activity.type}`}>
              <ActivityIcon size={14} />
            </span>
            <div className="activity-copy">
              {showCompany && <Link to={`/companies/${activity.companyId}`}>{company?.name}</Link>}
              <p>{activity.description}</p>
              <span className="activity-meta">
                {actor?.name ?? 'Website form'}
                <span className="dot-separator" />
                <time dateTime={activity.createdAt} title={dateLabel(activity.createdAt, 'PPpp')}>
                  {relativeTime(activity.createdAt)}
                </time>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
