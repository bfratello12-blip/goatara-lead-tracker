import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CirclePlus,
  FileClock,
  Users,
} from 'lucide-react';
import { salesStages, stageLabels } from '../../shared/crm.ts';
import { useCRM } from '../context.tsx';
import { companyContact, dateLabel, isOverdue, money, onboardingProgress, today } from '../lib.ts';
import { Avatar, Empty, PageHeader, SectionHeading, StatusBadge } from '../components/ui.tsx';
import { CompanyDialog } from '../components/forms.tsx';
import { ActivityList, CompanyTable, TaskList } from '../components/records.tsx';

function WebsiteEnquiries() {
  const { data } = useCRM();
  const [showAll, setShowAll] = useState(false);
  const submissions = data.submissions.toSorted(
    (first, second) => parseISO(second.receivedAt).getTime() - parseISO(first.receivedAt).getTime(),
  );
  const visible = showAll ? submissions : submissions.slice(0, 5);
  return (
    <section className="website-enquiries-section" aria-label="Website enquiries">
      <SectionHeading title="Website enquiries" count={submissions.length}>
        {submissions.length > 5 && (
          <button
            type="button"
            className="text-link"
            aria-expanded={showAll}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show latest' : 'View all'}
            {showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </SectionHeading>
      {visible.length ? (
        <ul className="website-enquiry-list">
          {visible.map((submission) => {
            const company = data.companies.find((record) => record.id === submission.companyId);
            const payload = submission.payload;
            const name = payload.businessName || payload.fullName || company?.name || 'Website enquiry';
            return (
              <li key={submission.id}>
                <Link
                  className="website-enquiry-row"
                  to={`/companies/${encodeURIComponent(submission.companyId)}?submission=${encodeURIComponent(submission.id)}`}
                  aria-label={`Open website enquiry from ${name}, ${dateLabel(submission.receivedAt, 'PPpp')}`}
                >
                  <span className="website-enquiry-contact">
                    <strong>{name}</strong>
                    <span className="cell-secondary">{payload.fullName || 'No contact name'}</span>
                    {payload.email && <span className="cell-secondary">{payload.email}</span>}
                  </span>
                  <span className="website-enquiry-details">
                    <span>{payload.products || 'No product details'}</span>
                    {payload.desiredStart && <span className="cell-secondary">{payload.desiredStart}</span>}
                  </span>
                  <span className="website-enquiry-received">
                    <time dateTime={parseISO(submission.receivedAt).toISOString()}>
                      {dateLabel(submission.receivedAt, 'MMM d, yyyy, h:mm a')}
                    </time>
                    {company && <StatusBadge company={company} />}
                  </span>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="website-enquiries-empty">
          <FileClock size={18} />
          <span>No website enquiries yet</span>
        </div>
      )}
    </section>
  );
}

export default function Overview() {
  const { data, session } = useCRM();
  const open = data.companies.filter((company) => !['won', 'lost'].includes(company.stage));
  const newLeads = open.filter((company) => company.stage === 'new');
  const clients = data.companies.filter((company) => company.clientStatus === 'active');
  const openTasks = data.tasks.filter((task) => !task.completedAt);
  const dueToday = openTasks.filter((task) => task.dueAt === today());
  const overdue = openTasks.filter((task) => isOverdue(task.dueAt));
  const focusTasks = [...overdue, ...dueToday].slice(0, 5);
  const attention = open
    .filter((company) => company.stage === 'new' || (company.followUpAt && company.followUpAt <= today()))
    .toSorted((first, second) => (first.followUpAt ?? '9999').localeCompare(second.followUpAt ?? '9999'))
    .slice(0, 5);
  const onboarding = data.companies.filter((company) => company.clientStatus === 'onboarding');
  const metrics = [
    {
      label: 'New leads',
      value: String(newLeads.length).padStart(2, '0'),
      hint: `${newLeads.length} awaiting first contact`,
      icon: CirclePlus,
      color: 'blue',
      link: '/pipeline?stage=new',
    },
    {
      label: 'Active clients',
      value: String(clients.length).padStart(2, '0'),
      hint: `${money(clients.reduce((total, company) => total + company.dealValue, 0))} monthly retainers`,
      icon: BriefcaseBusiness,
      color: 'green',
      link: '/companies?scope=clients&status=active',
    },
    {
      label: 'Tasks due today',
      value: String(dueToday.length).padStart(2, '0'),
      hint: `${overdue.length} overdue ${overdue.length === 1 ? 'task' : 'tasks'}`,
      icon: CalendarCheck2,
      color: 'orange',
      link: '/tasks?filter=today',
    },
  ];

  return (
    <div className="page overview-page">
      <PageHeader
        title="Overview"
        subtitle={
          <>
            <span>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
            <span className="dot-separator" />
            <span>Welcome back, {session.user.name.split(' ')[0]}</span>
          </>
        }
        actions={<CompanyDialog />}
      />
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <Link className="metric" key={metric.label} to={metric.link}>
            <div className="metric-top">
              <span>{metric.label}</span>
              <span className={`metric-icon ${metric.color}`}>
                <metric.icon size={18} strokeWidth={1.7} />
              </span>
            </div>
            <div className="metric-value">{metric.value}</div>
            <div
              className={`metric-bottom ${metric.color === 'orange' && overdue.length ? 'has-overdue' : ''}`}
            >
              <span>
                {metric.color === 'orange' && overdue.length > 0 && <span className="status-dot" />}
                {metric.hint}
              </span>
              <ArrowUpRight size={15} />
            </div>
          </Link>
        ))}
      </div>

      <WebsiteEnquiries />

      <section className="pipeline-overview">
        <SectionHeading title="Sales pipeline" link="/pipeline" linkText="View pipeline">
          <span />
        </SectionHeading>
        <div className="pipeline-overview-stages">
          {salesStages.map((stage) => {
            const companies = data.companies.filter((company) => company.stage === stage);
            return (
              <Link
                key={stage}
                className={`pipeline-summary-stage stage-${stage}`}
                to={`/pipeline?stage=${stage}`}
              >
                <span className="pipeline-stage-line">
                  <span>{stageLabels[stage]}</span>
                  <ChevronRight size={13} />
                </span>
                <span className="pipeline-summary-number">
                  {companies.length}
                  <span>{money(companies.reduce((total, company) => total + company.dealValue, 0))}</span>
                </span>
                <span className="pipeline-meter">
                  <span
                    style={{
                      width: `${Math.max((companies.length / Math.max(data.companies.length, 1)) * 100 * 3, companies.length ? 8 : 0)}%`,
                    }}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="dashboard-main-grid">
        <section className="attention-section">
          <SectionHeading
            title="Needs attention"
            link="/companies?scope=prospects"
            linkText="All prospects"
          />
          {attention.length ? (
            <CompanyTable companies={attention} compact />
          ) : (
            <Empty title="You're up to date" detail="No prospects need attention right now." />
          )}
        </section>
        <section className="focus-section">
          <SectionHeading title="Today's focus" link="/tasks" linkText="All tasks" />
          {overdue.length > 0 && (
            <Link className="overdue-summary" to="/tasks?filter=overdue">
              <span className="status-dot" />
              {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
              <ArrowRight size={13} />
            </Link>
          )}
          <TaskList tasks={focusTasks} compact />
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section>
          <SectionHeading title="Client onboarding" count={onboarding.length} link="/onboarding" />
          {onboarding.length ? (
            <div className="onboarding-preview">
              {onboarding.slice(0, 3).map((company) => {
                const progress = onboardingProgress(
                  data.onboarding.filter((item) => item.companyId === company.id),
                );
                return (
                  <Link
                    to={`/companies/${company.id}?tab=onboarding`}
                    key={company.id}
                    className="onboarding-preview-row"
                  >
                    <Avatar company name={company.name} color={company.color} size="small" />
                    <div className="onboarding-preview-copy">
                      <strong>{company.name}</strong>
                      <span>{companyContact(data, company.id)?.name ?? 'No primary contact'}</span>
                    </div>
                    <div className="onboarding-preview-progress">
                      <span>
                        {progress.done}
                        <span className="muted"> / {progress.total} complete</span>
                      </span>
                      <div className="progress-track">
                        <span style={{ width: `${progress.percent}%` }} />
                      </div>
                    </div>
                    <ArrowUpRight size={16} className="muted" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty icon={Users} title="No clients onboarding" />
          )}
        </section>
        <section className="recent-activity-section">
          <SectionHeading title="Recent activity" link="/activity" />
          <ActivityList activities={data.activities.slice(0, 3)} compact />
        </section>
      </div>
      <footer className="workspace-footer">
        <span className="status-dot" />
        Goatara workspace
        <span className="footer-separator" />
        {data.companies.length} companies
        <span className="footer-separator" />
        {data.team.length} team members
      </footer>
    </div>
  );
}
