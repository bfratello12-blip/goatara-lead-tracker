export const salesStages = ['new', 'contacted', 'discovery', 'proposal', 'won', 'lost'] as const;
export type SalesStage = (typeof salesStages)[number];
export type ClientStatus = 'onboarding' | 'active' | 'paused' | 'cancelled';
export type NoteKind = 'note' | 'call' | 'meeting';
export type Priority = 'low' | 'normal' | 'high';

export const stageLabels: Record<SalesStage, string> = {
  new: 'New lead',
  contacted: 'Contacted',
  discovery: 'Discovery',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

export interface LeadFields {
  currentSituation: string | null;
  storeUrl: string | null;
  products: string | null;
  productCount: string | null;
  monthlyRevenue: string | null;
  shippingMethod: string | null;
  desiredStart: string | null;
}

export interface Company extends LeadFields {
  id: string;
  name: string;
  stage: SalesStage;
  clientStatus: ClientStatus | null;
  ownerId: string | null;
  dealValue: number;
  currency: 'USD';
  createdAt: string;
  updatedAt: string;
  clientSince: string | null;
  followUpAt: string | null;
  expectedCloseAt: string | null;
  lostReason: string | null;
  tags: string[];
  color: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  color: string;
}

export interface Contact {
  id: string;
  companyId: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
}

export interface Note {
  id: string;
  companyId: string;
  authorId: string;
  content: string;
  kind: NoteKind;
  pinned: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  companyId: string;
  contactId: string | null;
  assigneeId: string | null;
  title: string;
  dueAt: string | null;
  priority: Priority;
  completedAt: string | null;
  createdAt: string;
}

export interface OnboardingItem {
  id: string;
  companyId: string;
  title: string;
  category: 'setup' | 'access' | 'launch';
  status: 'needed' | 'requested' | 'received' | 'not_required';
  updatedAt: string;
  position: number;
}

export interface Activity {
  id: string;
  companyId: string;
  actorId: string | null;
  type: 'lead' | 'stage' | 'status' | 'note' | 'task' | 'onboarding' | 'contact' | 'update';
  description: string;
  createdAt: string;
}

export interface CRMData {
  companies: Company[];
  contacts: Contact[];
  notes: Note[];
  tasks: Task[];
  onboarding: OnboardingItem[];
  activities: Activity[];
  team: TeamMember[];
  submissions: LeadSubmission[];
}

export interface LeadSubmission {
  id: string;
  companyId: string;
  receivedAt: string;
  payload: Record<string, string | null>;
}

export const onboardingTemplate = [
  ['Agreement signed', 'setup'],
  ['Billing setup', 'setup'],
  ['Shopify access', 'access'],
  ['Google Ads access', 'access'],
  ['Meta Ads access', 'access'],
  ['GA4 access', 'access'],
  ['Merchant Center access', 'access'],
  ['Creative assets', 'setup'],
  ['Account review', 'setup'],
  ['Strategy preparation', 'launch'],
  ['Campaign preparation', 'launch'],
  ['Launch', 'launch'],
] as const;

export function transitionCompany(company: Company, stage: SalesStage, now: string): Company {
  if (company.clientStatus && stage !== 'won') {
    throw new Error('Signed companies stay won. Update their client status instead.');
  }
  return {
    ...company,
    stage,
    updatedAt: now,
    clientStatus: stage === 'won' ? (company.clientStatus ?? 'onboarding') : company.clientStatus,
    clientSince: stage === 'won' ? (company.clientSince ?? now.slice(0, 10)) : company.clientSince,
    lostReason: stage === 'lost' ? company.lostReason : null,
  };
}
