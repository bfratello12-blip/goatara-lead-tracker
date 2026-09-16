import { useDeferredValue, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  ArrowUpRight,
  Clock3,
  Columns3,
  Filter,
  List,
  MoreHorizontal,
  Search,
  UserRound,
} from 'lucide-react';
import { salesStages, stageLabels, type Company, type SalesStage } from '../../shared/crm.ts';
import { useCRM } from '../context.tsx';
import { companyContact, companyMatches, dueLabel, isOverdue, money, websiteLabel } from '../lib.ts';
import { Avatar, Empty, IconButton, Owner, PageHeader, Segmented } from '../components/ui.tsx';
import { CompanyDialog } from '../components/forms.tsx';
import { CompanyTable } from '../components/records.tsx';

function PipelineCard({ company }: { company: Company }) {
  const { data, perform } = useCRM();
  const contact = companyContact(data, company.id);
  return (
    <article
      className="pipeline-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', company.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className="pipeline-card-top">
        <Avatar company name={company.name} color={company.color} size="small" />
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <IconButton label={`Actions for ${company.name}`}>
              <MoreHorizontal size={18} />
            </IconButton>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="dropdown" align="end" sideOffset={6}>
              <Dropdown.Item asChild>
                <Link to={`/companies/${company.id}`}>
                  <ArrowUpRight size={15} />
                  Open company
                </Link>
              </Dropdown.Item>
              {!company.clientStatus && (
                <>
                  <Dropdown.Separator />
                  <Dropdown.Label>Move to stage</Dropdown.Label>
                  {salesStages
                    .filter((stage) => stage !== company.stage)
                    .map((stage) => (
                      <Dropdown.Item
                        key={stage}
                        onSelect={() =>
                          void perform(
                            `/companies/${company.id}`,
                            'PATCH',
                            { stage },
                            stage === 'won'
                              ? 'Deal won. Client onboarding started.'
                              : `Moved to ${stageLabels[stage]}`,
                          )
                        }
                      >
                        <span className={`stage-dot stage-${stage}`} />
                        {stageLabels[stage]}
                      </Dropdown.Item>
                    ))}
                </>
              )}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
      <Link className="pipeline-card-company" to={`/companies/${company.id}`}>
        {company.name}
      </Link>
      <span className="pipeline-card-website">{websiteLabel(company.storeUrl)}</span>
      <div className="pipeline-card-tags">
        {company.tags.slice(0, 2).map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="pipeline-card-contact">
        <UserRound size={13} />
        {contact?.name ?? 'No primary contact'}
      </div>
      <div className="pipeline-card-bottom">
        <strong>
          {money(company.dealValue)}
          <span>/mo</span>
        </strong>
        <Owner user={data.team.find((member) => member.id === company.ownerId)} compact />
      </div>
      {company.followUpAt && (
        <div
          className={`pipeline-card-follow-up ${isOverdue(company.followUpAt) && !company.clientStatus ? 'overdue' : ''}`}
        >
          <Clock3 size={12} />
          {isOverdue(company.followUpAt) && !company.clientStatus
            ? 'Follow-up overdue'
            : `Follow up ${dueLabel(company.followUpAt).toLowerCase()}`}
        </div>
      )}
    </article>
  );
}

export default function Pipeline() {
  const { data, perform } = useCRM();
  const [params, setParams] = useSearchParams();
  const stageParam = params.get('stage') ?? 'all';
  const group = stageParam === 'won' || stageParam === 'lost' ? stageParam : 'open';
  const [layout, setLayout] = useState('board');
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);
  const [owner, setOwner] = useState('all');
  const [dropTarget, setDropTarget] = useState('');
  const activeStages: SalesStage[] =
    group === 'open'
      ? stageParam !== 'all' && salesStages.includes(stageParam as SalesStage)
        ? [stageParam as SalesStage]
        : ['new', 'contacted', 'discovery', 'proposal']
      : [group];
  const filtered = data.companies.filter(
    (company) =>
      activeStages.includes(company.stage) &&
      (owner === 'all' || company.ownerId === owner) &&
      companyMatches(company, data, query),
  );
  const openCount = data.companies.filter((company) => !['won', 'lost'].includes(company.stage)).length;
  async function drop(event: React.DragEvent, stage: SalesStage) {
    event.preventDefault();
    setDropTarget('');
    const id = event.dataTransfer.getData('text/plain');
    const company = data.companies.find((item) => item.id === id);
    if (!company || company.stage === stage) return;
    await perform(`/companies/${id}`, 'PATCH', { stage }, `Moved to ${stageLabels[stage]}`);
  }

  return (
    <div className="page pipeline-page">
      <PageHeader
        title="Sales pipeline"
        subtitle={
          <>
            <span>{openCount} open opportunities</span>
            <span className="dot-separator" />
            <span>
              {money(
                data.companies
                  .filter((company) => !['won', 'lost'].includes(company.stage))
                  .reduce((total, company) => total + company.dealValue, 0),
              )}{' '}
              potential monthly retainers
            </span>
          </>
        }
        actions={<CompanyDialog />}
      />
      <div className="view-tabs">
        <button className={group === 'open' ? 'active' : ''} onClick={() => setParams({})}>
          Open pipeline<span>{openCount}</span>
        </button>
        <button className={group === 'won' ? 'active' : ''} onClick={() => setParams({ stage: 'won' })}>
          Won<span>{data.companies.filter((company) => company.stage === 'won').length}</span>
        </button>
        <button className={group === 'lost' ? 'active' : ''} onClick={() => setParams({ stage: 'lost' })}>
          Lost<span>{data.companies.filter((company) => company.stage === 'lost').length}</span>
        </button>
      </div>
      <div className="view-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search pipeline"
            placeholder="Search companies..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="toolbar-filters">
          <Filter size={15} />
          <select
            aria-label="Pipeline owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
          >
            <option value="all">All owners</option>
            {data.team.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          {group === 'open' && (
            <select
              aria-label="Pipeline stage"
              value={stageParam}
              onChange={(event) =>
                setParams(event.target.value === 'all' ? {} : { stage: event.target.value })
              }
            >
              <option value="all">All stages</option>
              {salesStages
                .filter((stage) => !['won', 'lost'].includes(stage))
                .map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabels[stage]}
                  </option>
                ))}
            </select>
          )}
        </div>
        <Segmented
          label="Pipeline view"
          value={layout}
          onChange={setLayout}
          options={[
            { value: 'board', label: <Columns3 size={16} aria-label="Board view" /> },
            { value: 'list', label: <List size={16} aria-label="List view" /> },
          ]}
        />
      </div>
      {layout === 'list' ? (
        <CompanyTable companies={filtered} />
      ) : (
        <div className="pipeline-board-scroll">
          <div className="pipeline-board" style={{ '--columns': activeStages.length } as CSSProperties}>
            {activeStages.map((stage) => {
              const companies = filtered.filter((company) => company.stage === stage);
              return (
                <section
                  key={stage}
                  className={`pipeline-column stage-${stage} ${dropTarget === stage ? 'drop-target' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropTarget(stage);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget('');
                  }}
                  onDrop={(event) => void drop(event, stage)}
                >
                  <header className="pipeline-column-header">
                    <div>
                      <span className="stage-dot" />
                      <h2>{stageLabels[stage]}</h2>
                      <span className="count-badge">{companies.length}</span>
                    </div>
                    <span>
                      {money(companies.reduce((total, company) => total + company.dealValue, 0))}
                      <span className="muted"> /mo</span>
                    </span>
                  </header>
                  <div className="pipeline-cards">
                    {companies.map((company) => (
                      <PipelineCard key={company.id} company={company} />
                    ))}
                    {!companies.length && <Empty title="No opportunities" />}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
