import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Download, KeyRound, LockKeyhole, Plus, ShieldCheck, UserPlus } from 'lucide-react';
import { useCRM, useSave } from '../context.tsx';
import { request, today } from '../lib.ts';
import {
  Avatar,
  Button,
  Field,
  IconButton,
  InlineError,
  Modal,
  PageHeader,
  SectionHeading,
} from '../components/ui.tsx';

export function TeamPage() {
  const { data, session, mutate, notify } = useCRM();
  const [open, setOpen] = useState(false);
  const { saving, error, save } = useSave();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void save(async () => {
      await mutate('/team', 'POST', {
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        role: form.get('role'),
      });
      notify('Team member added');
      setOpen(false);
    });
  }
  return (
    <div className="page team-page">
      <PageHeader
        title="Team"
        subtitle={`${data.team.length} members in the Goatara workspace`}
        actions={
          session.user.role === 'admin' ? (
            <Button
              variant="primary"
              onClick={() => setOpen(true)}
              disabled={session.demoMode}
              title={session.demoMode ? 'Team account creation is unavailable in the demo' : undefined}
            >
              <UserPlus size={16} />
              Add member
            </Button>
          ) : undefined
        }
      />
      {session.demoMode && (
        <div className="demo-context">
          <ShieldCheck size={16} />
          Demo accounts<span>Sample workspace</span>
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table team-table">
          <thead>
            <tr>
              <th>Team member</th>
              <th>Role</th>
              <th>Companies</th>
              <th>Open tasks</th>
            </tr>
          </thead>
          <tbody>
            {data.team.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="company-cell">
                    <Avatar name={member.name} color={member.color} />
                    <div>
                      <strong>
                        {member.name}
                        {member.id === session.user.id && <span className="you-label">You</span>}
                      </strong>
                      <span className="cell-secondary">{member.email}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${member.role === 'admin' ? 'status-active' : 'status-contacted'}`}>
                    {member.role === 'admin' ? <ShieldCheck size={12} /> : null}
                    {member.role === 'admin' ? 'Administrator' : 'Member'}
                  </span>
                </td>
                <td>{data.companies.filter((company) => company.ownerId === member.id).length}</td>
                <td>
                  {data.tasks.filter((task) => task.assigneeId === member.id && !task.completedAt).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!saving) setOpen(next);
        }}
        title="Add team member"
      >
        <form className="modal-form" onSubmit={submit}>
          <div className="modal-body form-grid">
            <Field label="Full name" required className="full">
              <input name="name" autoFocus required maxLength={200} />
            </Field>
            <Field label="Work email" required className="full">
              <input name="email" type="email" required />
            </Field>
            {!session.authDisabled && (
              <Field label="Initial password" required className="full">
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={1024}
                  autoComplete="new-password"
                />
              </Field>
            )}
            <Field label="Role" className="full">
              <select name="role">
                <option value="member">Member</option>
                <option value="admin">Administrator</option>
              </select>
            </Field>
          </div>
          <div className="modal-footer">
            <InlineError message={error} />
            <Button type="button" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" busy={saving}>
              <Plus size={16} />
              Add member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function SettingsPage() {
  const { data, session, notify } = useCRM();
  const [settings, setSettings] = useState<{
    demoMode: boolean;
    intakeConfigured: boolean;
    intakePath: string;
    secureCookies: boolean;
  } | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const { saving, error, save } = useSave();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    void request<typeof settings>('/settings')
      .then(setSettings)
      .catch((issue: Error) => setSettingsError(issue.message));
  }, []);
  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    void save(async () => {
      if (form.get('newPassword') !== form.get('confirmation'))
        throw new Error('The new passwords do not match');
      await request('/auth/password', 'POST', {
        currentPassword: form.get('currentPassword'),
        newPassword: form.get('newPassword'),
      });
      element.reset();
      notify('Password updated. Other sessions have been signed out.');
    });
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `goatara-workspace-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Workspace export downloaded');
  }
  return (
    <div className="page settings-page">
      <PageHeader title="Settings" subtitle="Goatara workspace" />
      <div className="settings-layout">
        <section className="settings-section">
          <SectionHeading title="Workspace" />
          <dl className="settings-details">
            <div>
              <dt>Workspace name</dt>
              <dd>Goatara</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>
                <LockKeyhole size={14} />
                {session.authDisabled ? 'Direct access' : 'Authenticated team workspace'}
              </dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>
                <span className={`badge ${session.demoMode ? 'status-proposal' : 'status-active'}`}>
                  {session.demoMode ? 'Local demo' : 'Shared workspace'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>SQLite · Persistent</dd>
            </div>
            <div>
              <dt>Team members</dt>
              <dd>{data.team.length}</dd>
            </div>
          </dl>
        </section>
        <section className="settings-section">
          <SectionHeading title="Website intake" />
          <InlineError message={settingsError} />
          <dl className="settings-details">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`badge ${settings?.intakeConfigured ? 'status-active' : 'status-paused'}`}>
                  <span className="status-dot" />
                  {settings
                    ? settings.intakeConfigured
                      ? 'Connected endpoint'
                      : 'Not configured'
                    : 'Loading...'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>
                <code>POST</code>
              </dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd className="endpoint-value">
                <code>/api/intake/leads</code>
                <IconButton
                  label="Copy intake endpoint"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/api/intake/leads`);
                      setCopied(true);
                      notify('Endpoint copied');
                    } catch {
                      notify('The clipboard is not available in this browser', true);
                    }
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </IconButton>
              </dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>Server-to-server bearer token</dd>
            </div>
          </dl>
        </section>
        <section className="settings-section">
          <SectionHeading title={session.authDisabled ? 'Workspace identity' : 'Your account'} />
          <div className="settings-user">
            <Avatar name={session.user.name} color={session.user.color} />
            <div>
              <strong>{session.user.name}</strong>
              <span>{session.user.email}</span>
            </div>
            <span className="badge status-active">
              {session.user.role === 'admin' ? 'Administrator' : 'Member'}
            </span>
          </div>
          {!session.authDisabled && (
            <>
              <h3 className="small-section-title password-heading">
                <KeyRound size={15} />
                Change password{session.demoMode && <span className="muted">Unavailable in demo</span>}
              </h3>
              <form className="password-form" onSubmit={changePassword}>
                <Field label="Current password">
                  <input
                    name="currentPassword"
                    type="password"
                    required
                    disabled={session.demoMode}
                    autoComplete="current-password"
                  />
                </Field>
                <div className="form-grid">
                  <Field label="New password">
                    <input
                      name="newPassword"
                      type="password"
                      required
                      minLength={12}
                      maxLength={1024}
                      disabled={session.demoMode}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <input
                      name="confirmation"
                      type="password"
                      required
                      minLength={12}
                      maxLength={1024}
                      disabled={session.demoMode}
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <InlineError message={error} />
                <Button type="submit" busy={saving} disabled={session.demoMode}>
                  <KeyRound size={15} />
                  Update password
                </Button>
              </form>
            </>
          )}
        </section>
        <section className="settings-section">
          <SectionHeading title="Workspace data" />
          <dl className="settings-details">
            <div>
              <dt>Companies</dt>
              <dd>{data.companies.length}</dd>
            </div>
            <div>
              <dt>Contacts</dt>
              <dd>{data.contacts.length}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{data.notes.length}</dd>
            </div>
            <div>
              <dt>Website submissions</dt>
              <dd>{data.submissions.length}</dd>
            </div>
          </dl>
          <Button onClick={exportData}>
            <Download size={15} />
            Export JSON
          </Button>
        </section>
      </div>
    </div>
  );
}
