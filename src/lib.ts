import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from 'date-fns';
import type { Company, CRMData, OnboardingItem } from '../shared/crm.ts';

export const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    value,
  );
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => /[a-z0-9]/i.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
export const today = () => format(new Date(), 'yyyy-MM-dd');
export const dateLabel = (date: string | null, pattern = 'MMM d') =>
  date ? format(parseISO(date), pattern) : 'Not set';
export const relativeTime = (date: string) => formatDistanceToNowStrict(parseISO(date), { addSuffix: true });
export const isOverdue = (date: string | null) => Boolean(date && date.slice(0, 10) < today());
export const dueLabel = (date: string | null) =>
  !date
    ? 'No due date'
    : isToday(parseISO(date))
      ? 'Today'
      : isTomorrow(parseISO(date))
        ? 'Tomorrow'
        : dateLabel(date);
export const companyContact = (data: CRMData, id: string) =>
  data.contacts.find((contact) => contact.companyId === id && contact.isPrimary);
export const websiteLabel = (url: string | null) => {
  if (!url) return 'No website';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
export const companyMatches = (company: Company, data: CRMData, query: string) => {
  const search = query.trim().toLowerCase();
  return (
    !search ||
    [
      company.name,
      company.products,
      company.storeUrl,
      ...company.tags,
      ...data.contacts
        .filter((contact) => contact.companyId === company.id)
        .flatMap((contact) => [contact.name, contact.email, contact.phone]),
    ].some((value) => value?.toLowerCase().includes(search))
  );
};
export function onboardingProgress(items: OnboardingItem[]) {
  const required = items.filter((item) => item.status !== 'not_required');
  const done = required.filter((item) => item.status === 'received').length;
  return {
    done,
    total: required.length,
    percent: required.length ? Math.round((done / required.length) * 100) : items.length ? 100 : 0,
  };
}
export const leadFieldLabels: Record<string, string> = {
  currentSituation: 'Where are you at right now?',
  storeUrl: 'Link to your store, listings, or products',
  products: 'What do you sell?',
  productCount: 'Roughly how many products?',
  monthlyRevenue: 'Current monthly revenue across all channels',
  shippingMethod: 'How would orders get shipped?',
  desiredStart: 'When would you want to start?',
  fullName: 'Full name',
  businessName: 'Business name',
  email: 'Email',
  phone: 'Phone',
};

let csrfToken = '';
export const setCsrfToken = (token: string) => {
  csrfToken = token;
};

export function clearLocalDrafts() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('goatara:draft:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    return;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function request<Type>(path: string, method = 'GET', body?: unknown): Promise<Type> {
  let response: Response;
  const controller = new AbortController();
  const timeout = method === 'GET' ? setTimeout(() => controller.abort(), 20000) : undefined;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal: controller.signal,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    if (controller.signal.aborted)
      throw new ApiError('The server took too long to respond. Please try again.', 408);
    throw new ApiError(
      'Cannot reach the server. Your draft is still here. Check your connection and try again.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = (await response
      .json()
      .catch(() => ({ message: 'The request could not be completed. Please try again.' }))) as {
      message: string;
    };
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('goatara:session-expired'));
    throw new ApiError(error.message, response.status);
  }
  return response.status === 204 ? (undefined as Type) : (response.json() as Promise<Type>);
}
