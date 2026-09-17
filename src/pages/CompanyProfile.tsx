import { useEffect, useState } from 'react';
import { parseISO } from 'date-fns';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileClock,
  FileText,
  Globe,
  Mail,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { salesStages, stageLabels, type Company } from '../../shared/crm.ts';
import { useCRM } from '../context.tsx';
import { dateLabel, isOverdue, leadFieldLabels, money, websiteLabel } from '../lib.ts';
import {
  Avatar,
  Button,
  Empty,
  IconButton,
  Modal,
  Owner,
  SectionHeading,
  Segmented,
  StatusBadge,
} from '../components/ui.tsx';
import { CompanyDialog, ContactDialog, TaskDialog } from '../components/forms.tsx';
import { ActivityList, NoteCard, NoteComposer, TaskList } from '../components/records.tsx';
import { OnboardingChecklist } from '../components/onboarding.tsx';

function SubmissionHistory({ company }: { company: Company }) {
  const { data } = useCRM();
  const [open, setOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const submissions = data.submissions
    .filter((submission) => submission.companyId === company.id)
    .toSorted(
      (first, second) => parseISO(second.receivedAt).getTime() - parseISO(first.receivedAt).getTime(),
    );
  const selectedSubmission = submissions.find((submission) => submission.id === params.get('submission'));
  return (
    <Modal
      open={open || Boolean(selectedSubmission)}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && params.has('submission')) {
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.delete('submission');
              return next;
            },
            { replace: true },
          );
        }
      }}
      title={selectedSubmission ? 'Website enquiry' : 'Website enquiries'}
      description={company.name}
      wide
      trigger={
        <button className="text-link submission-history">
          <FileClock size={14} />
          Submission history<span className="count-badge">{submissions.length}</span>
          <ArrowUpRight size={13} />
        </button>
      }
    >
      <div className="modal-body">
        {submissions.length ? (
          (selectedSubmission ? [selectedSubmission] : submissions).map((submission) => (
            <section className="submission-record" key={submission.id}>
              <h3>
                <CalendarDays size={16} />
                {dateLabel(submission.receivedAt, 'PPpp')}
              </h3>
              <dl className="submission-fields">
                {Object.entries(leadFieldLabels).map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{submission.payload[key] || <span className="muted">Not provided</span>}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))
        ) : (
          <Empty icon={FileText} title="No website submissions" detail="This company was added internally." />
        )}
      </div>
    </Modal>
  );
}

function CompanySidebar({ company }: { company: Company }) {
  const { data, perform } = useCRM();
  const [updating, setUpdating] = useState(false);
  const contacts = data.contacts.filter((contact) => contact.companyId === company.id);
  async function update(patch: object) {
    setUpdating(true);
    await perform(`/companies/${company.id}`, 'PATCH', patch, 'Relationship updated');
    setUpdating(false);
  }
  return (
    <aside className="company-sidebar">
      <section className="company-sidebar-section">
        <SectionHeading title="Relationship" />
        <div className="relationship-fields">
          <label>
            <span>Sales stage</span>
            <select
              aria-label="Sales stage"
              value={company.stage}
              disabled={Boolean(company.clientStatus) || updating}
              onChange={(event) => void update({ stage: event.target.value })}
            >
              {salesStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            </select>
          </label>
          {company.clientStatus && (
            <label>
              <span>Client status</span>
              <select
                aria-label="Client status"
                disabled={updating}
                value={company.clientStatus}
                onChange={(event) => void update({ clientStatus: event.target.value })}
              >
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          )}
          <label>
            <span>Account owner</span>
            <select
              aria-label="Account owner"
              disabled={updating}
              value={company.ownerId ?? ''}
              onChange={(event) => void update({ ownerId: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {data.team.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {company.stage === 'lost' && (
          <dl className="lead-details">
            <div>
              <dt>Lost reason</dt>
              <dd>{company.lostReason || 'Not recorded'}</dd>
            </div>
          </dl>
        )}
      </section>
      <section className="company-sidebar-section">
        <SectionHeading title="Contacts" count={contacts.length}>
          <ContactDialog companyId={company.id}>
            <IconButton label="Add contact">
              <UserPlus size={16} />
            </IconButton>
          </ContactDialog>
        </SectionHeading>
        <div className="contact-list">
          {contacts.map((contact) => (
            <div className="profile-contact" key={contact.id}>
              <div className="profile-contact-top">
                <Avatar name={contact.name} color={company.color} size="small" />
                <div>
                  <strong>{contact.name}</strong>
                  <span>
                    {contact.title || (contact.isPrimary ? 'Primary contact' : 'Additional contact')}
                  </span>
                </div>
                <ContactDialog companyId={company.id} contact={contact}>
                  <IconButton label={`Edit ${contact.name}`}>
                    <Pencil size={13} />
                  </IconButton>
                </ContactDialog>
              </div>
              {contact.email && (
                <a className="contact-method" href={`mailto:${contact.email}`}>
                  <Mail size={13} />
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a className="contact-method" href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>
                  <Phone size={13} />
                  {contact.phone}
                </a>
              )}
            </div>
          ))}
          {!contacts.length && <p className="muted small">No contacts yet.</p>}
        </div>
      </section>
      <section className="company-sidebar-section">
        <SectionHeading title="Lead details">
          <CompanyDialog company={company}>
            <IconButton label="Edit lead details">
              <Pencil size={14} />
            </IconButton>
          </CompanyDialog>
        </SectionHeading>
        <dl className="lead-details">
          {(
            [
              'currentSituation',
              'products',
              'productCount',
              'monthlyRevenue',
              'shippingMethod',
              'desiredStart',
            ] as const
          ).map((field) => (
            <div key={field}>
              <dt>{leadFieldLabels[field]}</dt>
              <dd>{company[field] || <span className="muted">Not provided</span>}</dd>
            </div>
          ))}
        </dl>
        <SubmissionHistory company={company} />
      </section>
      <section className="company-sidebar-section">
        <h3 className="small-section-title">Important dates</h3>
        <dl className="compact-details">
          <div>
            <dt>First enquiry</dt>
            <dd>{dateLabel(company.createdAt, 'MMM d, yyyy')}</dd>
          </div>
          <div>
            <dt>Expected close</dt>
            <dd>{dateLabel(company.expectedCloseAt, 'MMM d, yyyy')}</dd>
          </div>
          {company.clientStatus && (
            <div>
              <dt>Client since</dt>
              <dd>{dateLabel(company.clientSince, 'MMM d, yyyy')}</dd>
            </div>
          )}
          <div>
            <dt>Last updated</dt>
            <dd>{dateLabel(company.updatedAt, 'MMM d, yyyy')}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}

function Profile({ company }: { company: Company }) {
  const { data, perform } = useCRM();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const tab = ['overview', 'notes', 'tasks', 'onboarding', 'activity'].includes(params.get('tab') ?? '')
    ? params.get('tab')!
    : 'overview';
  const [callSignal, setCallSignal] = useState(0);
  const [noteFilter, setNoteFilter] = useState('all');
  const [taskFilter, setTaskFilter] = useState('open');
  const notes = data.notes.filter((note) => note.companyId === company.id);
  const tasks = data.tasks.filter((task) => task.companyId === company.id);
  const activities = data.activities.filter((activity) => activity.companyId === company.id);
  const owner = data.team.find((member) => member.id === company.ownerId);
  async function deleteCompany() {
    const confirmed = window.confirm(
      `Delete ${company.name}? This permanently removes the company, contacts, submissions, notes, tasks, onboarding, and activity history.`,
    );
    if (!confirmed) return;
    if (await perform(`/companies/${company.id}`, 'DELETE', undefined, 'Company deleted')) navigate('/companies');
  }
  useEffect(() => {
    if (location.hash)
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [location.hash, tab]);
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'notes', label: 'Notes', count: notes.length },
    { key: 'tasks', label: 'Tasks', count: tasks.filter((task) => !task.completedAt).length },
    ...(company.clientStatus ? [{ key: 'onboarding', label: 'Onboarding' }] : []),
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <div className="page profile-page">
      <div className="profile-breadcrumb">
        <Link to="/companies">
          <ArrowLeft size={14} />
          Companies
        </Link>
        <ChevronRight size={13} />
        <span>{company.name}</span>
      </div>
      <header className="profile-header">
        <div className="profile-identity">
          <Avatar company name={company.name} color={company.color} size="large" />
          <div>
            <div className="profile-title-line">
              <h1>{company.name}</h1>
              <StatusBadge company={company} />
            </div>
            <div className="profile-website">
              {company.storeUrl ? (
                <a href={company.storeUrl} target="_blank" rel="noreferrer noopener">
                  <Globe size={13} />
                  {websiteLabel(company.storeUrl)}
                  <ArrowUpRight size={12} />
                </a>
              ) : (
                <span className="muted">
                  <Globe size={13} />
                  No website
                </span>
              )}
              {company.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <Button
            onClick={() => {
              setParams({ tab: 'notes' });
              setCallSignal((previous) => previous + 1);
            }}
            variant="primary"
          >
            <Phone size={15} />
            Log a call
          </Button>
          <TaskDialog companyId={company.id}>
            <Button>
              <Plus size={16} />
              New task
            </Button>
          </TaskDialog>
          <CompanyDialog company={company}>
            <IconButton label="Edit company">
              <Pencil size={17} />
            </IconButton>
          </CompanyDialog>
          <IconButton label="Delete company" className="danger" onClick={() => void deleteCompany()}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      </header>
      <div className="profile-facts">
        <div>
          <span>Account owner</span>
          <Owner user={owner} />
        </div>
        <div>
          <span>Monthly retainer</span>
          <strong>
            {money(company.dealValue)}
            <span className="per-month">/mo</span>
          </strong>
        </div>
        <div>
          <span>Next follow-up</span>
          <strong className={isOverdue(company.followUpAt) ? 'overdue' : ''}>
            <Clock3 size={14} />
            {dateLabel(company.followUpAt, 'MMM d, yyyy')}
          </strong>
        </div>
        <div>
          <span>{company.clientStatus ? 'Client since' : 'Expected close'}</span>
          <strong>
            <CalendarDays size={14} />
            {dateLabel(company.clientStatus ? company.clientSince : company.expectedCloseAt, 'MMM d, yyyy')}
          </strong>
        </div>
      </div>
      <div className="view-tabs profile-tabs" role="tablist" aria-label="Company views">
        {tabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? 'active' : ''}
            onClick={() => setParams(item.key === 'overview' ? {} : { tab: item.key })}
          >
            {item.label}
            {item.count !== undefined && <span>{item.count}</span>}
          </button>
        ))}
      </div>
      <div className="profile-layout">
        <div className="profile-main" role="tabpanel" aria-label={`${tab} view`}>
          {(tab === 'overview' || tab === 'notes') && (
            <>
              <SectionHeading
                title={tab === 'overview' ? 'Add to the conversation' : 'Notes & conversations'}
              />
              <NoteComposer companyId={company.id} callSignal={callSignal} />
              <div className="notes-section-heading">
                <SectionHeading title={tab === 'overview' ? 'Recent notes' : 'History'} count={notes.length}>
                  {tab === 'overview' && notes.length > 3 ? (
                    <button className="text-link" onClick={() => setParams({ tab: 'notes' })}>
                      View all notes
                      <ArrowUpRight size={14} />
                    </button>
                  ) : undefined}
                </SectionHeading>
                {tab === 'notes' && (
                  <Segmented
                    label="Filter notes"
                    value={noteFilter}
                    onChange={setNoteFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'call', label: 'Calls' },
                      { value: 'meeting', label: 'Meetings' },
                      { value: 'pinned', label: 'Pinned' },
                    ]}
                  />
                )}
              </div>
              <div className="note-feed">
                {(tab === 'overview'
                  ? notes.slice(0, 3)
                  : notes.filter(
                      (note) =>
                        noteFilter === 'all' ||
                        (noteFilter === 'pinned' ? note.pinned : note.kind === noteFilter),
                    )
                ).map((note) => (
                  <NoteCard note={note} key={note.id} />
                ))}
                {!notes.length && (
                  <Empty
                    icon={FileText}
                    title="The conversation starts here"
                    detail="No notes have been added yet."
                  />
                )}
              </div>
            </>
          )}
          {tab === 'tasks' && (
            <>
              <SectionHeading title="Company tasks">
                <TaskDialog companyId={company.id}>
                  <Button>
                    <Plus size={15} />
                    New task
                  </Button>
                </TaskDialog>
              </SectionHeading>
              <Segmented
                label="Company task status"
                value={taskFilter}
                onChange={setTaskFilter}
                options={[
                  { value: 'open', label: 'Open' },
                  { value: 'completed', label: 'Completed' },
                ]}
              />
              <TaskList
                tasks={tasks.filter((task) =>
                  taskFilter === 'completed' ? task.completedAt : !task.completedAt,
                )}
                showCompany={false}
              />
            </>
          )}
          {tab === 'onboarding' && <OnboardingChecklist company={company} />}
          {tab === 'activity' && (
            <>
              <SectionHeading title="Relationship history" count={activities.length} />
              <ActivityList activities={activities} showCompany={false} />
            </>
          )}
        </div>
        <CompanySidebar company={company} />
      </div>
    </div>
  );
}

export default function CompanyProfile() {
  const { id } = useParams();
  const { data } = useCRM();
  const company = data.companies.find((item) => item.id === id);
  return company ? (
    <Profile key={company.id} company={company} />
  ) : (
    <div className="page">
      <Empty
        title="Company not found"
        action={
          <Link className="button secondary" to="/companies">
            <ArrowLeft size={16} />
            Back to companies
          </Link>
        }
      />
    </div>
  );
}
