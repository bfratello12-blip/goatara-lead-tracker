import { z } from 'zod';
import { salesStages } from './crm.ts';

const text = (max = 2000) => z.string().trim().max(max).nullable().optional();
const email = z
  .union([z.email().max(254), z.literal('')])
  .nullable()
  .optional();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Enter a valid date')
  .nullable()
  .optional();
const identifier = z.string().min(1).max(100);
const website = text(2000)
  .transform((value, context) => {
    if (!value) return value;
    try {
      const parsed = new URL(value.includes('://') ? value : `https://${value}`);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error();
      return parsed.href;
    } catch {
      context.addIssue({ code: 'custom', message: 'Enter an http or https website URL' });
      return z.NEVER;
    }
  })
  .optional();

export const leadSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required').max(200),
  fullName: text(200),
  email,
  phone: text(80),
  currentSituation: text(10000),
  storeUrl: website,
  products: text(10000),
  productCount: text(200),
  monthlyRevenue: text(200),
  shippingMethod: text(2000),
  desiredStart: text(1000),
});
export type LeadInput = z.infer<typeof leadSchema>;

const publicWebsiteLeadSchema = z.object({
  businessName: text(200),
  fullName: text(200),
  firstName: text(100),
  lastName: text(100),
  email,
  phone: text(80),
  currentSituation: text(10000),
  whereDoYouSellToday: text(10000),
  products: text(10000),
  tellUsAboutProducts: text(10000),
  storeUrl: website,
  productCount: text(200),
  monthlyRevenue: text(200),
  shippingMethod: text(2000),
  desiredStart: text(1000),
});

export function parseWebsiteLead(input: unknown): LeadInput {
  const raw = publicWebsiteLeadSchema.parse(input);
  const fullName = raw.fullName || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || null;
  const businessName = raw.businessName || (fullName ? `Unconfirmed - ${fullName}` : null);
  return leadSchema.parse({
    businessName,
    fullName,
    email: raw.email,
    phone: raw.phone,
    currentSituation: raw.currentSituation || raw.whereDoYouSellToday,
    storeUrl: raw.storeUrl,
    products: raw.products || raw.tellUsAboutProducts,
    productCount: raw.productCount,
    monthlyRevenue: raw.monthlyRevenue,
    shippingMethod: raw.shippingMethod,
    desiredStart: raw.desiredStart,
  });
}

export const createCompanySchema = leadSchema.extend({
  stage: z.enum(salesStages).default('new'),
  ownerId: identifier.nullable().optional(),
  dealValue: z.number().finite().min(0).max(1000000000).default(0),
  followUpAt: date,
  expectedCloseAt: date,
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type CompanyInput = z.infer<typeof createCompanySchema>;

export const companyPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    stage: z.enum(salesStages).optional(),
    clientStatus: z.enum(['onboarding', 'active', 'paused', 'cancelled']).nullable().optional(),
    ownerId: identifier.nullable().optional(),
    dealValue: z.number().finite().min(0).max(1000000000).optional(),
    clientSince: date,
    followUpAt: date,
    expectedCloseAt: date,
    lostReason: text(4000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    currentSituation: text(10000),
    storeUrl: website,
    products: text(10000),
    productCount: text(200),
    monthlyRevenue: text(200),
    shippingMethod: text(2000),
    desiredStart: text(1000),
  })
  .strict();
export type CompanyPatch = z.infer<typeof companyPatchSchema>;

export const noteSchema = z.object({
  content: z.string().trim().min(1, 'Write a note first').max(100000),
  kind: z.enum(['note', 'call', 'meeting']).default('note'),
});
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email,
  phone: text(80),
  title: text(200),
  isPrimary: z.boolean().default(false),
});
export const taskSchema = z.object({
  companyId: identifier,
  contactId: identifier.nullable().optional(),
  assigneeId: identifier.nullable().optional(),
  title: z.string().trim().min(1).max(500),
  dueAt: date,
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
export const taskPatchSchema = taskSchema
  .omit({ companyId: true })
  .partial()
  .extend({ completed: z.boolean().optional() })
  .strict();
export const onboardingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(['setup', 'access', 'launch']).default('setup'),
});
export const onboardingPatchSchema = z.object({
  status: z.enum(['needed', 'requested', 'received', 'not_required']),
});
export const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) });
export const userSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(254),
  password: z.string().min(12, 'Use at least 12 characters').max(1024),
  role: z.enum(['admin', 'member']).default('member'),
});
export const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(12, 'Use at least 12 characters').max(1024),
});
