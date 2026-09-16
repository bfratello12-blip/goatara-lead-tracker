import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { CRMData, TeamMember } from '../shared/crm.ts';
import { request } from './lib.ts';

export interface Session {
  user: TeamMember;
  csrfToken: string;
  demoMode: boolean;
}
interface CRMContextValue {
  data: CRMData;
  session: Session;
  refresh: () => Promise<void>;
  mutate: <Type = unknown>(path: string, method: string, body?: unknown) => Promise<Type>;
  perform: (path: string, method: string, body: unknown, message?: string) => Promise<boolean>;
  notify: (message: string, error?: boolean) => void;
}
const CRMContext = createContext<CRMContextValue | null>(null);

export function CRMProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [data, setData] = useState<CRMData | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const version = useRef(0);

  async function refresh() {
    const current = ++version.current;
    const next = await request<CRMData>('/workspace');
    if (current === version.current) {
      setData(next);
      setError('');
    }
  }
  const onSync = useEffectEvent(() => {
    void refresh().catch((issue: Error) => {
      if (!data) setError(issue.message);
    });
  });
  useEffect(() => {
    onSync();
    const sync = () => onSync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.error ? 8000 : 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, isError = false) => setToast({ message, error: isError });
  async function mutate<Type = unknown>(path: string, method: string, body?: unknown) {
    const result = await request<Type>(path, method, body);
    try {
      await refresh();
    } catch {
      notify('Saved, but the workspace could not refresh. Refresh to see the latest changes.', true);
    }
    return result;
  }
  async function perform(path: string, method: string, body: unknown, message = 'Changes saved') {
    try {
      await mutate(path, method, body);
      notify(message);
      return true;
    } catch (issue) {
      notify((issue as Error).message, true);
      return false;
    }
  }

  if (!data)
    return (
      <div className="app-loading">
        {error ? (
          <>
            <CircleAlert size={28} />
            <h2>Workspace unavailable</h2>
            <p>{error}</p>
            <button
              className="button primary"
              onClick={() => void refresh().catch((issue: Error) => setError(issue.message))}
            >
              <RefreshCw size={16} />
              Try again
            </button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={28} />
            <p>Opening your workspace...</p>
          </>
        )}
      </div>
    );

  return (
    <CRMContext.Provider value={{ data, session, refresh, mutate, perform, notify }}>
      {children}
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.error ? <CircleAlert size={19} /> : <CheckCircle2 size={19} />}
          <span>{toast.message}</span>
          <button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </CRMContext.Provider>
  );
}

export function useCRM() {
  const context = useContext(CRMContext);
  if (!context) throw new Error('CRM context is unavailable');
  return context;
}

export function useSave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function save(operation: () => Promise<void>) {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await operation();
    } catch (issue) {
      setError((issue as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return { saving, error, save };
}
