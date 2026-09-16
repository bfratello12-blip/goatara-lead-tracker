import { useDeferredValue, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  ChartNoAxesCombined,
  CheckCheck,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Clock3,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import logo from '../images/logos/Goataralogo_black.png';
import { CRMProvider, useCRM, useSave, type Session } from './context.tsx';
import { ApiError, clearLocalDrafts, isOverdue, request, setCsrfToken, websiteLabel } from './lib.ts';
import { Avatar, Button, Empty, Field, IconButton, InlineError, Modal } from './components/ui.tsx';
import Overview from './pages/Overview.tsx';
import Pipeline from './pages/Pipeline.tsx';
import Companies from './pages/Companies.tsx';
import CompanyProfile from './pages/CompanyProfile.tsx';
import { ActivityPage, NotesPage, OnboardingPage, TasksPage } from './pages/Work.tsx';
import { SettingsPage, TeamPage } from './pages/Settings.tsx';

const navigation = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/pipeline', label: 'Sales pipeline', icon: ChartNoAxesCombined },
  { path: '/companies', label: 'Companies', icon: Building2 },
  { path: '/tasks', label: 'Tasks', icon: CheckCheck },
  { path: '/onboarding', label: 'Onboarding', icon: Rocket },
  { path: '/notes', label: 'Notes', icon: MessageSquare },
];
const management = [
  { path: '/team', label: 'Team', icon: Users },
  { path: '/activity', label: 'Activity', icon: Activity },
  { path: '/settings', label: 'Settings', icon: Settings },
];

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data } = useCRM();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim().toLowerCase());
  const [selected, setSelected] = useState(0);
  const companyResults = data.companies
    .filter(
      (company) =>
        !query ||
        [company.name, company.storeUrl, company.products].some((value) =>
          value?.toLowerCase().includes(query),
        ),
    )
    .slice(0, query ? 6 : 5)
    .map((company) => ({
      id: company.id,
      type: 'Company',
      title: company.name,
      detail: websiteLabel(company.storeUrl),
      to: `/companies/${company.id}`,
      icon: Building2,
    }));
  const contactResults = query
    ? data.contacts
        .filter((contact) =>
          [contact.name, contact.email, contact.phone].some((value) => value?.toLowerCase().includes(query)),
        )
        .slice(0, 5)
        .map((contact) => ({
          id: contact.id,
          type: 'Contact',
          title: contact.name,
          detail: data.companies.find((company) => company.id === contact.companyId)?.name ?? '',
          to: `/companies/${contact.companyId}`,
          icon: Users,
        }))
    : [];
  const taskResults = query
    ? data.tasks
        .filter((task) => task.title.toLowerCase().includes(query))
        .slice(0, 5)
        .map((task) => ({
          id: task.id,
          type: 'Task',
          title: task.title,
          detail: data.companies.find((company) => company.id === task.companyId)?.name ?? '',
          to: `/companies/${task.companyId}?tab=tasks`,
          icon: CheckCheck,
        }))
    : [];
  const noteResults = query
    ? data.notes
        .filter((note) => note.content.toLowerCase().includes(query))
        .slice(0, 5)
        .map((note) => ({
          id: note.id,
          type: 'Note',
          title: note.content.replace(/\s+/g, ' ').slice(0, 95),
          detail: data.companies.find((company) => company.id === note.companyId)?.name ?? '',
          to: `/companies/${note.companyId}?tab=notes#note-${note.id}`,
          icon: FileText,
        }))
    : [];
  const results = [...companyResults, ...contactResults, ...taskResults, ...noteResults];
  function choose(to: string) {
    onOpenChange(false);
    setSearch('');
    setSelected(0);
    navigate(to);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Search workspace" className="search-modal">
      <div className="global-search-input">
        <Search size={21} />
        <input
          autoFocus
          role="combobox"
          aria-label="Search workspace"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-activedescendant={results[selected] ? `search-result-${selected}` : undefined}
          aria-autocomplete="list"
          placeholder="Search companies, contacts, tasks, notes..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((previous) => Math.min(previous + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((previous) => Math.max(previous - 1, 0));
            } else if (event.key === 'Enter' && results[selected]) {
              event.preventDefault();
              choose(results[selected].to);
            }
          }}
        />
        <IconButton label="Close search" onClick={() => onOpenChange(false)}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="search-results" id="global-search-results" role="listbox" aria-label="Search results">
        <div className="search-results-label">{query ? `${results.length} results` : 'Recently updated'}</div>
        {results.map((result, index) => (
          <button
            key={`${result.type}-${result.id}`}
            role="option"
            aria-selected={selected === index}
            id={`search-result-${index}`}
            className={`search-result ${selected === index ? 'selected' : ''}`}
            onMouseEnter={() => setSelected(index)}
            onClick={() => choose(result.to)}
          >
            <span className="search-result-icon">
              <result.icon size={17} />
            </span>
            <span className="search-result-copy">
              <strong>{result.title}</strong>
              <span>{result.detail}</span>
            </span>
            <span className="search-result-type">{result.type}</span>
            <ArrowUpRight size={14} />
          </button>
        ))}
        {!results.length && <Empty icon={Search} title="No matches found" />}
      </div>
    </Modal>
  );
}

function SidebarContent({ close, onLogout }: { close?: () => void; onLogout: () => void }) {
  const { session, data } = useCRM();
  const openTasks = data.tasks.filter((task) => !task.completedAt).length;
  return (
    <div className="sidebar-inner">
      <Link to="/" className="brand" aria-label="Goatara overview" onClick={close}>
        <img src={logo} alt="Goatara" />
      </Link>
      <div className="workspace-name">
        <span className="workspace-symbol">
          <Building2 size={15} />
        </span>
        <div>
          <strong>Goatara workspace</strong>
          <span>Internal CRM</span>
        </div>
        <span className="workspace-status-dot" />
      </div>
      <span className="nav-group-label">Workspace</span>
      <nav className="main-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} onClick={close}>
            <item.icon size={18} strokeWidth={1.7} />
            <span>{item.label}</span>
            {item.path === '/tasks' && openTasks > 0 && <span className="nav-count">{openTasks}</span>}
            {item.path === '/pipeline' && data.companies.some((company) => company.stage === 'new') && (
              <span className="nav-new-dot" />
            )}
          </NavLink>
        ))}
      </nav>
      <span className="nav-group-label manage-label">Manage</span>
      <nav className="main-nav" aria-label="Workspace management">
        {management.map((item) => (
          <NavLink key={item.path} to={item.path} onClick={close}>
            <item.icon size={18} strokeWidth={1.7} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="workspace-security">
          <ShieldCheck size={14} />
          <span>{session.demoMode ? 'Local demo workspace' : 'Private workspace'}</span>
        </div>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button className="user-menu-trigger">
              <Avatar name={session.user.name} color={session.user.color} size="small" />
              <span>
                <strong>{session.user.name}</strong>
                <span>{session.user.role === 'admin' ? 'Administrator' : 'Team member'}</span>
              </span>
              <ChevronsUpDown size={14} />
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content className="dropdown user-dropdown" side="top" sideOffset={8} align="start">
              <Dropdown.Label>{session.user.email}</Dropdown.Label>
              <Dropdown.Item asChild>
                <Link to="/settings" onClick={close}>
                  <Settings size={15} />
                  Account settings
                </Link>
              </Dropdown.Item>
              <Dropdown.Item asChild>
                <Link to="/team" onClick={close}>
                  <Users size={15} />
                  Your team
                </Link>
              </Dropdown.Item>
              <Dropdown.Separator />
              {session.demoMode ? (
                <Dropdown.Item disabled>
                  <FlaskConical size={15} />
                  Local demo
                </Dropdown.Item>
              ) : (
                <Dropdown.Item onSelect={onLogout}>
                  <LogOut size={15} />
                  Sign out
                </Dropdown.Item>
              )}
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </div>
  );
}

function Shell({ onLogout: signOut }: { onLogout: () => Promise<void> }) {
  const { data, session, refresh, notify } = useCRM();
  const onLogout = () => {
    void signOut().catch((issue: Error) => notify(issue.message, true));
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const location = useLocation();
  const current = [...navigation, ...management].find((item) =>
    item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
  );
  const overdue = data.tasks.filter((task) => !task.completedAt && isOverdue(task.dueAt));
  const newLeads = data.companies.filter((company) => company.stage === 'new');
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((previous) => !previous);
      }
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);
  useEffect(() => {
    document.title = `${current?.label ?? 'Workspace'} | Goatara`;
  }, [current?.label]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <SidebarContent onLogout={onLogout} />
      </aside>
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="sidebar-overlay" />
          <Dialog.Content className="sidebar mobile-sidebar" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
            <Dialog.Close asChild>
              <button className="mobile-close icon-button" aria-label="Close navigation">
                <X size={18} />
              </button>
            </Dialog.Close>
            <SidebarContent close={() => setMobileOpen(false)} onLogout={onLogout} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <IconButton
              label="Open navigation"
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </IconButton>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight size={13} className="breadcrumb-chevron" />
            <strong>{current?.label ?? 'Workspace'}</strong>
          </div>
          <button
            className="topbar-search"
            title="Search workspace (Ctrl+K)"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={16} />
            <span>Search anything...</span>
          </button>
          <div className="topbar-actions">
            {session.demoMode && (
              <span className="demo-badge">
                <FlaskConical size={12} />
                <span>Demo workspace</span>
              </span>
            )}
            <IconButton
              label="Refresh workspace"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true);
                try {
                  await refresh();
                } catch (issue) {
                  notify((issue as Error).message, true);
                } finally {
                  setRefreshing(false);
                }
              }}
            >
              <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
            </IconButton>
            <Dropdown.Root>
              <Dropdown.Trigger asChild>
                <IconButton label="Needs attention" className="notification-trigger">
                  <Bell size={18} />
                  {overdue.length + newLeads.length > 0 && <span className="notification-dot" />}
                </IconButton>
              </Dropdown.Trigger>
              <Dropdown.Portal>
                <Dropdown.Content className="dropdown notifications-dropdown" align="end" sideOffset={12}>
                  <Dropdown.Label>
                    Needs attention<span className="count-badge">{overdue.length + newLeads.length}</span>
                  </Dropdown.Label>
                  {overdue.slice(0, 3).map((task) => (
                    <Dropdown.Item asChild key={task.id}>
                      <Link to={`/companies/${task.companyId}?tab=tasks`}>
                        <span className="notification-icon overdue">
                          <Clock3 size={16} />
                        </span>
                        <span>
                          <strong>{task.title}</strong>
                          <span className="notice-detail">
                            {data.companies.find((company) => company.id === task.companyId)?.name} · Overdue
                          </span>
                        </span>
                        <ChevronRight size={13} />
                      </Link>
                    </Dropdown.Item>
                  ))}
                  {newLeads.slice(0, 3).map((company) => (
                    <Dropdown.Item asChild key={company.id}>
                      <Link to={`/companies/${company.id}`}>
                        <span className="notification-icon">
                          <Building2 size={16} />
                        </span>
                        <span>
                          <strong>{company.name}</strong>
                          <span className="notice-detail">New lead</span>
                        </span>
                        <ChevronRight size={13} />
                      </Link>
                    </Dropdown.Item>
                  ))}
                  {overdue.length + newLeads.length === 0 && (
                    <div className="notifications-empty">Nothing needs your attention.</div>
                  )}
                  <Dropdown.Separator />
                  <Dropdown.Item asChild>
                    <Link to="/tasks">
                      View all tasks
                      <ArrowUpRight size={14} />
                    </Link>
                  </Dropdown.Item>
                </Dropdown.Content>
              </Dropdown.Portal>
            </Dropdown.Root>
            <span className="topbar-divider" />
            <Avatar name={session.user.name} color={session.user.color} size="small" />
          </div>
        </header>
        <main id="main-content" className="main-content">
          <Outlet />
        </main>
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function SignIn({
  onSession,
  initialError,
}: {
  onSession: (session: Session) => void;
  initialError: string;
}) {
  const { saving, error, save } = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(async () =>
      onSession(
        await request<Session>('/auth/login', 'POST', {
          email: form.get('email'),
          password: form.get('password'),
        }),
      ),
    );
  }
  return (
    <div className="signin-page">
      <header className="signin-top">
        <img src={logo} alt="Goatara" />
        <span>
          <LockKeyhole size={14} />
          Private workspace
        </span>
      </header>
      <div className="signin-content">
        <span className="signin-icon">
          <LockKeyhole size={25} strokeWidth={1.5} />
        </span>
        <h1>Welcome back.</h1>
        <p>Sign in to your Goatara workspace.</p>
        <form onSubmit={submit}>
          <Field label="Work email">
            <input name="email" type="email" required autoFocus autoComplete="username" />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={1024}
            />
          </Field>
          <InlineError message={error || initialError} />
          <Button type="submit" variant="primary" busy={saving}>
            Sign in
            <ArrowRight size={16} />
          </Button>
        </form>
        <div className="signin-private">
          <ShieldCheck size={14} />
          Team access only
        </div>
      </div>
      <footer>Goatara · Internal workspace</footer>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  function acceptSession(next: Session) {
    setCsrfToken(next.csrfToken);
    setSession(next);
    setError('');
  }
  useEffect(() => {
    void request<Session>('/auth/me')
      .then(acceptSession)
      .catch((issue: Error) => {
        if (!(issue instanceof ApiError && issue.status === 401)) setError(issue.message);
      })
      .finally(() => setLoading(false));
    const expired = () => {
      setSession(null);
      setCsrfToken('');
      setError('Your session expired. Sign in to continue.');
    };
    window.addEventListener('goatara:session-expired', expired);
    return () => window.removeEventListener('goatara:session-expired', expired);
  }, []);
  async function logout() {
    await request('/auth/logout', 'POST');
    clearLocalDrafts();
    setSession(null);
    setCsrfToken('');
    setError('');
  }
  if (loading)
    return (
      <div className="app-loading">
        <img src={logo} alt="Goatara" />
        <LoaderCircle size={24} className="spin" />
      </div>
    );
  if (!session) return <SignIn onSession={acceptSession} initialError={error} />;
  return (
    <CRMProvider session={session}>
      <Routes>
        <Route element={<Shell onLogout={logout} />}>
          <Route index element={<Overview />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id" element={<CompanyProfile />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="notes" element={<NotesPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <div className="page">
                <Empty
                  icon={CircleHelp}
                  title="Page not found"
                  action={
                    <Link className="button primary" to="/">
                      Back to overview
                      <ArrowRight size={15} />
                    </Link>
                  }
                />
              </div>
            }
          />
        </Route>
      </Routes>
    </CRMProvider>
  );
}
