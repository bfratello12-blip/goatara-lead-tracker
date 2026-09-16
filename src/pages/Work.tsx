import { useDeferredValue, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  CircleDashed,
  Clock3,
  FileText,
  Filter,
  Flag,
  Pencil,
  Pin,
  Rocket,
  Search,
} from 'lucide-react';
import { useCRM } from '../context.tsx';
import { companyContact, dueLabel, isOverdue, onboardingProgress, today } from '../lib.ts';
import { Avatar, Empty, IconButton, Owner, PageHeader, StatusBadge } from '../components/ui.tsx';
import { TaskDialog } from '../components/forms.tsx';
import { ActivityList, NewNoteDialog, NoteCard, TaskCheck } from '../components/records.tsx';

export function TasksPage() {
  const { data } = useCRM();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? 'open';
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.toLowerCase());
  const [assignee, setAssignee] = useState('all');
  const [companyId, setCompanyId] = useState('all');
  const open = data.tasks.filter((task) => !task.completedAt);
  const tabs = [
    { key: 'open', label: 'All open', count: open.length },
    { key: 'today', label: 'Today', count: open.filter((task) => task.dueAt === today()).length },
    { key: 'overdue', label: 'Overdue', count: open.filter((task) => isOverdue(task.dueAt)).length },
    {
      key: 'upcoming',
      label: 'Upcoming',
      count: open.filter((task) => task.dueAt && task.dueAt > today()).length,
    },
    { key: 'completed', label: 'Completed', count: data.tasks.filter((task) => task.completedAt).length },
  ];
  const tasks = data.tasks.filter(
    (task) =>
      (filter === 'completed'
        ? Boolean(task.completedAt)
        : !task.completedAt &&
          (filter === 'today'
            ? task.dueAt === today()
            : filter === 'overdue'
              ? isOverdue(task.dueAt)
              : filter === 'upcoming'
                ? task.dueAt && task.dueAt > today()
                : true)) &&
      (assignee === 'all' || task.assigneeId === assignee) &&
      (companyId === 'all' || task.companyId === companyId) &&
      (task.title.toLowerCase().includes(query) ||
        data.companies
          .find((company) => company.id === task.companyId)
          ?.name.toLowerCase()
          .includes(query)),
  );
  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle={
          <>
            <span>{open.length} open tasks</span>
            <span className="dot-separator" />
            <span className={tabs[2].count ? 'overdue' : ''}>{tabs[2].count} overdue</span>
          </>
        }
        actions={<TaskDialog />}
      />
      <div className="view-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={filter === tab.key ? 'active' : ''}
            onClick={() => setParams(tab.key === 'open' ? {} : { filter: tab.key })}
          >
            {tab.label}
            <span>{tab.count}</span>
          </button>
        ))}
      </div>
      <div className="view-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            placeholder="Search tasks..."
            aria-label="Search tasks"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="toolbar-filters">
          <Filter size={15} />
          <select
            aria-label="Task assignee"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="all">All assignees</option>
            {data.team.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Task company"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            <option value="all">All companies</option>
            {data.companies.map((company) => (
              <option value={company.id} key={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {tasks.length ? (
        <div className="table-scroll">
          <table className="data-table tasks-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Company / contact</th>
                <th>Due date</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className={task.completedAt ? 'completed' : ''}>
                  <td>
                    <div className="task-table-title">
                      <TaskCheck task={task} />
                      <TaskDialog task={task}>
                        <button className="task-title">{task.title}</button>
                      </TaskDialog>
                    </div>
                  </td>
                  <td>
                    <Link className="table-company-link" to={`/companies/${task.companyId}`}>
                      {data.companies.find((company) => company.id === task.companyId)?.name}
                    </Link>
                    <span className="cell-secondary">
                      {data.contacts.find((contact) => contact.id === task.contactId)?.name}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`due-date ${!task.completedAt && isOverdue(task.dueAt) ? 'overdue' : ''}`}
                    >
                      <Clock3 size={13} />
                      {dueLabel(task.dueAt)}
                    </span>
                  </td>
                  <td>
                    <span className={`priority priority-${task.priority}`}>
                      <Flag size={12} />
                      {task.priority[0].toUpperCase() + task.priority.slice(1)}
                    </span>
                  </td>
                  <td>
                    <Owner user={data.team.find((member) => member.id === task.assigneeId)} />
                  </td>
                  <td>
                    <TaskDialog task={task}>
                      <IconButton label={`Edit task: ${task.title}`}>
                        <Pencil size={14} />
                      </IconButton>
                    </TaskDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={CheckCircle2} title="All clear" detail="No tasks match this view." />
      )}
      <div className="table-footer">
        {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
      </div>
    </div>
  );
}

export function NotesPage() {
  const { data } = useCRM();
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.toLowerCase());
  const [companyId, setCompanyId] = useState('all');
  const [kind, setKind] = useState('all');
  const [pinned, setPinned] = useState(false);
  const notes = data.notes.filter(
    (note) =>
      (!pinned || note.pinned) &&
      (companyId === 'all' || note.companyId === companyId) &&
      (kind === 'all' || note.kind === kind) &&
      (note.content.toLowerCase().includes(query) ||
        data.companies
          .find((company) => company.id === note.companyId)
          ?.name.toLowerCase()
          .includes(query)),
  );
  return (
    <div className="page notes-page">
      <PageHeader
        title="Notes & conversations"
        subtitle={`${data.notes.length} notes across your relationships`}
        actions={<NewNoteDialog />}
      />
      <div className="view-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search every conversation..."
            aria-label="Search notes"
          />
        </div>
        <div className="toolbar-filters">
          <Filter size={15} />
          <select
            aria-label="Note company"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            <option value="all">All companies</option>
            {data.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Note type filter"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">All types</option>
            <option value="note">Notes</option>
            <option value="call">Calls</option>
            <option value="meeting">Meetings</option>
          </select>
        </div>
        <IconButton
          label={pinned ? 'Show all notes' : 'Show pinned notes'}
          className={pinned ? 'is-pinned' : ''}
          aria-pressed={pinned}
          onClick={() => setPinned((previous) => !previous)}
        >
          <Pin size={16} />
        </IconButton>
      </div>
      <div className="notes-page-list">
        {notes.map((note) => (
          <NoteCard note={note} key={note.id} showCompany />
        ))}
      </div>
      {!notes.length && (
        <Empty icon={FileText} title="No notes found" detail="No conversations match these filters." />
      )}
    </div>
  );
}

export function OnboardingPage() {
  const { data } = useCRM();
  const [filter, setFilter] = useState('onboarding');
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.toLowerCase());
  const [owner, setOwner] = useState('all');
  const clients = data.companies.filter((company) => company.clientStatus);
  const onboarding = clients.filter((company) => company.clientStatus === 'onboarding');
  const accessWaiting = data.onboarding.filter(
    (item) =>
      item.category === 'access' &&
      ['needed', 'requested'].includes(item.status) &&
      onboarding.some((company) => company.id === item.companyId),
  );
  const filtered = clients.filter(
    (company) =>
      (filter === 'all' || company.clientStatus === filter) &&
      company.name.toLowerCase().includes(query) &&
      (owner === 'all' || company.ownerId === owner),
  );
  return (
    <div className="page onboarding-page">
      <PageHeader
        title="Client onboarding"
        subtitle={
          <>
            <span>{onboarding.length} clients in progress</span>
            <span className="dot-separator" />
            <span>{accessWaiting.length} outstanding access items</span>
          </>
        }
      />
      <div className="view-tabs">
        <button className={filter === 'onboarding' ? 'active' : ''} onClick={() => setFilter('onboarding')}>
          In progress<span>{onboarding.length}</span>
        </button>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All clients<span>{clients.length}</span>
        </button>
      </div>
      <div className="view-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            placeholder="Search clients..."
            aria-label="Search onboarding clients"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="toolbar-filters">
          <Filter size={15} />
          <select
            aria-label="Onboarding owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="all">All owners</option>
            {data.team.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {filtered.length ? (
        <div className="onboarding-grid">
          {filtered.map((company) => {
            const items = data.onboarding.filter((item) => item.companyId === company.id);
            const progress = onboardingProgress(items);
            const next = items.filter((item) => ['needed', 'requested'].includes(item.status)).slice(0, 3);
            return (
              <article className="onboarding-card" key={company.id}>
                <div className="onboarding-card-top">
                  <Avatar company name={company.name} color={company.color} />
                  <StatusBadge company={company} />
                </div>
                <Link className="onboarding-company-name" to={`/companies/${company.id}?tab=onboarding`}>
                  {company.name}
                </Link>
                <span className="onboarding-contact-name">
                  {companyContact(data, company.id)?.name ?? 'No primary contact'}
                </span>
                <div className="onboarding-card-progress">
                  <span>
                    <strong>{progress.percent}%</strong> complete
                  </span>
                  <span>
                    {progress.done} / {progress.total}
                  </span>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="onboarding-next">
                  <h3>{next.length ? 'Next up' : 'All set'}</h3>
                  {next.length ? (
                    next.map((item) => (
                      <div key={item.id}>
                        {item.status === 'requested' ? <CircleDashed size={15} /> : <Circle size={15} />}
                        <span>{item.title}</span>
                        {item.status === 'requested' && <span className="requested-label">Requested</span>}
                      </div>
                    ))
                  ) : (
                    <div className="all-complete">
                      <CheckCircle2 size={16} />
                      Onboarding complete
                    </div>
                  )}
                </div>
                <div className="onboarding-card-footer">
                  <Owner user={data.team.find((member) => member.id === company.ownerId)} />
                  <Link className="text-link" to={`/companies/${company.id}?tab=onboarding`}>
                    Open checklist
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty icon={Rocket} title="No clients in this view" />
      )}
    </div>
  );
}

export function ActivityPage() {
  const { data } = useCRM();
  const [companyId, setCompanyId] = useState('all');
  const [type, setType] = useState('all');
  const activities = data.activities.filter(
    (activity) =>
      (companyId === 'all' || activity.companyId === companyId) && (type === 'all' || activity.type === type),
  );
  return (
    <div className="page activity-page">
      <PageHeader title="Activity" subtitle="Workspace history" />
      <div className="view-toolbar">
        <div className="toolbar-filters">
          <Filter size={15} />
          <select
            aria-label="Activity company"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            <option value="all">All companies</option>
            {data.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <select aria-label="Activity type" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All activity</option>
            <option value="lead">Enquiries</option>
            <option value="stage">Sales stage</option>
            <option value="status">Client status</option>
            <option value="note">Notes</option>
            <option value="task">Tasks</option>
            <option value="onboarding">Onboarding</option>
            <option value="contact">Contacts</option>
            <option value="update">Details updated</option>
          </select>
        </div>
      </div>
      <ActivityList activities={activities} />
    </div>
  );
}
