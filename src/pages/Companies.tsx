import { useDeferredValue, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, Filter, Search, X } from 'lucide-react';
import { salesStages, stageLabels } from '../../shared/crm.ts';
import { useCRM } from '../context.tsx';
import { companyMatches } from '../lib.ts';
import { IconButton, PageHeader } from '../components/ui.tsx';
import { CompanyDialog } from '../components/forms.tsx';
import { CompanyTable } from '../components/records.tsx';

export default function Companies() {
  const { data } = useCRM();
  const [params, setParams] = useSearchParams();
  const scope = params.get('scope') ?? 'all';
  const status = params.get('status') ?? 'all';
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search);
  const [owner, setOwner] = useState('all');
  const [sort, setSort] = useState('updated');
  const filtered = data.companies
    .filter(
      (company) =>
        (scope === 'all' || (scope === 'clients' ? Boolean(company.clientStatus) : !company.clientStatus)) &&
        (status === 'all' || company.stage === status || company.clientStatus === status) &&
        (owner === 'all' || company.ownerId === owner) &&
        companyMatches(company, data, query),
    )
    .toSorted((first, second) =>
      sort === 'name'
        ? first.name.localeCompare(second.name)
        : sort === 'value'
          ? second.dealValue - first.dealValue
          : sort === 'followup'
            ? (first.followUpAt ?? '9999').localeCompare(second.followUpAt ?? '9999')
            : second.updatedAt.localeCompare(first.updatedAt),
    );
  return (
    <div className="page companies-page">
      <PageHeader
        title="Companies"
        subtitle={`${data.companies.length} relationships in your workspace`}
        actions={<CompanyDialog />}
      />
      <div className="view-tabs">
        {[
          { key: 'all', label: 'All companies', count: data.companies.length },
          {
            key: 'prospects',
            label: 'Prospects',
            count: data.companies.filter((company) => !company.clientStatus).length,
          },
          {
            key: 'clients',
            label: 'Clients',
            count: data.companies.filter((company) => company.clientStatus).length,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            className={scope === tab.key ? 'active' : ''}
            onClick={() => setParams(tab.key === 'all' ? {} : { scope: tab.key })}
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
            aria-label="Search companies and contacts"
            placeholder="Search companies or contacts..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="toolbar-filters">
          <Filter size={15} />
          <select
            value={status}
            aria-label="Company status"
            onChange={(event) => setParams({ scope, status: event.target.value })}
          >
            <option value="all">All statuses</option>
            {scope !== 'clients' &&
              salesStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stageLabels[stage]}
                </option>
              ))}
            {scope !== 'prospects' &&
              ['onboarding', 'active', 'paused', 'cancelled'].map((clientStatus) => (
                <option key={clientStatus} value={clientStatus}>
                  {clientStatus[0].toUpperCase() + clientStatus.slice(1)}
                </option>
              ))}
          </select>
          <select value={owner} aria-label="Company owner" onChange={(event) => setOwner(event.target.value)}>
            <option value="all">All owners</option>
            {data.team.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sort-control">
          <ArrowDownWideNarrow size={15} />
          <select value={sort} aria-label="Sort companies" onChange={(event) => setSort(event.target.value)}>
            <option value="updated">Recently updated</option>
            <option value="name">Company name</option>
            <option value="value">Retainer value</option>
            <option value="followup">Follow-up date</option>
          </select>
        </div>
        {(search || owner !== 'all' || status !== 'all') && (
          <IconButton
            label="Clear company filters"
            onClick={() => {
              setSearch('');
              setOwner('all');
              setParams(scope === 'all' ? {} : { scope });
            }}
          >
            <X size={15} />
          </IconButton>
        )}
      </div>
      <CompanyTable companies={filtered} />
      <div className="table-footer">
        {filtered.length} of {data.companies.length} companies
      </div>
    </div>
  );
}
